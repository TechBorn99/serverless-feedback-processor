import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dotenv from 'dotenv';
import { Construct } from 'constructs';

dotenv.config();

export class ScfsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const feedbackTable = new dynamodb.Table(this, 'Feedbacks', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      contributorInsightsEnabled: true,
    });

    const attachmentsBucket = new s3.Bucket(this, 'FeedbackAttachments', {
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const notificationTopic = new sns.Topic(this, 'FeedbackNotificationTopic');
    
    const feedbackProcessingFn = new lambda.Function(this, 'FeedbackProcessingHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'feedbackProcessing.handler',
      environment: {
        TABLE_NAME: feedbackTable.tableName,
        BUCKET_NAME: attachmentsBucket.bucketName,
        NOTIFICATION_TOPIC_ARN: notificationTopic.topicArn
      }
    });

    const apiGatewayLoggingRole = new iam.Role(this, 'ApiGatewayLoggingRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs')
      ]
    });

    const apiLogs = new logs.LogGroup(this, 'ApiLogs', {
      logGroupName: '/aws/apigateway/FeedbackProcessing',
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const feedbackProcessingApi = new apigateway.LambdaRestApi(this, 'FeedbackProcessingEndpoint', {
      handler: feedbackProcessingFn,
      binaryMediaTypes: ['multipart/form-data'],
      deployOptions: {
        stageName: 'prod',
        dataTraceEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        metricsEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogs),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
      }
    });

    const apiGatewayAccount = new apigateway.CfnAccount(this, 'ApiGatewayAccount', {
      cloudWatchRoleArn: apiGatewayLoggingRole.roleArn,
    });

    feedbackProcessingApi.node.addDependency(apiGatewayAccount);

    const lambdaInvocationMetric = new cloudwatch.Metric({
      namespace: 'AWS/Lambda',
      metricName: 'Invocations',
      dimensionsMap: {
        FunctionName: feedbackProcessingFn.functionName
      },
      period: cdk.Duration.minutes(1)
    });

    const lambdaInvocationAlarm = new cloudwatch.Alarm(this, 'FeedbackProcessingAlarm', {
      metric: lambdaInvocationMetric,
      threshold: 1000,
      evaluationPeriods: 1,
      alarmDescription: 'Alarm when the lambda function invocations exceed threshold',
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD
    });

    // * Simple dashboard, expand per your needs
    const cloudwatchDashboard = new cloudwatch.Dashboard(this, 'SCFSDashboard');
    cloudwatchDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Feedback Processing Lambda Invocations',
        left: [lambdaInvocationMetric]
      }),
    );

    const alarmNotificationTopic = new sns.Topic(this, 'AlarmNotificationTopic');
    new sns.Subscription(this, 'AlarmEmailSubscription', {
      topic: alarmNotificationTopic,
      protocol: sns.SubscriptionProtocol.EMAIL,
      endpoint: process.env.ALARM_NOTIFY_EMAIL || ''
    });
    lambdaInvocationAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(alarmNotificationTopic));

    feedbackTable.grantWriteData(feedbackProcessingFn);
    attachmentsBucket.grantPut(feedbackProcessingFn);
    notificationTopic.grantPublish(feedbackProcessingFn);
  }
}
