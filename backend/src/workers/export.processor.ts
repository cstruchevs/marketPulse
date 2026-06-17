import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { EXPORT_QUEUE, GENERATE_CSV_EXPORT_JOB } from './queues.config';

interface ExportJobData {
  productId: string;
  userId: string;
  dateFrom: string;
  dateTo: string;
}

const PRESIGNED_URL_EXPIRES_SECONDS = 3600; // 1 hour

@Processor(EXPORT_QUEUE)
export class ExportProcessor extends WorkerHost {
  private readonly logger = new Logger(ExportProcessor.name);
  private readonly lambda: LambdaClient;
  private readonly s3: S3Client;
  private readonly exportBucket: string;
  private readonly lambdaFunction: string;

  constructor(private readonly config: ConfigService) {
    super();

    const endpoint = config.get('LOCALSTACK_ENDPOINT');
    const region = config.get('AWS_REGION') ?? 'us-east-1';

    this.exportBucket = config.get('S3_BUCKET_EXPORTS') ?? 'market-pulse-exports';
    this.lambdaFunction = config.get('LAMBDA_EXPORT_FUNCTION') ?? 'market-pulse-export';

    this.lambda = new LambdaClient({ region, endpoint });
    this.s3 = new S3Client({ region, endpoint, forcePathStyle: !!endpoint });
  }

  async process(job: Job<ExportJobData>): Promise<void> {
    if (job.name !== GENERATE_CSV_EXPORT_JOB) return;

    const { productId, userId, dateFrom, dateTo } = job.data;
    this.logger.log(`Generating CSV export for product ${productId} user ${userId}`);

    const outputKey = `exports/${userId}/${productId}/${Date.now()}.csv`;

    // Invoke Lambda to generate CSV and upload to S3
    const lambdaResp = await this.lambda.send(
      new InvokeCommand({
        FunctionName: this.lambdaFunction,
        Payload: Buffer.from(
          JSON.stringify({ productId, userId, dateFrom, dateTo, outputKey, bucket: this.exportBucket }),
        ),
      }),
    );

    if (lambdaResp.FunctionError) {
      throw new Error(`Lambda export failed: ${lambdaResp.FunctionError}`);
    }

    // Generate presigned download URL (expires in 1h)
    const downloadUrl = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.exportBucket, Key: outputKey }),
      { expiresIn: PRESIGNED_URL_EXPIRES_SECONDS },
    );

    // SSE notification will be sent in Step 9
    this.logger.log(
      `Export ready for user ${userId}: ${downloadUrl} (SSE notification deferred to Step 9)`,
    );
  }
}
