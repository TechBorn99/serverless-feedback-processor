# Serverless Customer Feedback System (SCFS)

## Overview

SCFS is a sample serverless application built on AWS that allows users to submit feedback with optional file attachments. The system automatically categorizes feedback, saves it to a DynamoDB table, stores files in an S3 bucket, and notifies the relevant department through SNS.

## Architecture

The application uses AWS Lambda for processing feedback, Amazon API Gateway for the RESTful endpoint, Amazon S3 for storing attachments, Amazon DynamoDB for persisting feedback, and Amazon SNS for notifications.

## Prerequisites

- AWS CLI installed and configured
- Node.js and NPM installed
- AWS CDK installed
- An AWS account with appropriate permissions

## Deployment

To deploy the SCFS stack:

1. Clone the repository to your local machine.
2. Navigate to the project directory.
3. Run `npm install` to install the required dependencies.
4. Navigate to the `lambda` directory and run `npm install` to install Lambda function dependencies.
5. Back in the project root, run `cdk deploy` to deploy the stack to your AWS account.

## Testing

To test the feedback submission:

1. Use Postman or a similar tool to send a `POST` request to the API Gateway endpoint.
2. Set the body to `form-data` and include the `feedback` and `attachments` keys.
3. Observe the response and verify that the feedback is stored in DynamoDB and the attachment is stored in S3.

### Request:

- `feedback`: The text content of the feedback.
- `attachments`: A file to be attached to the feedback.

### Response:

- `200 OK`: Feedback processed successfully.
- `5xx Internal Server Error`: An error occurred processing the feedback.

## Environment Variables

Ensure the following environment variables are set:

- `ALARM_NOTIFY_EMAIL`: Email for the notifications sent by SNS

## Cleanup

To delete the SCFS stack and all its resources:

1. Run `cdk destroy` from the project root.

## Contributing

Contributions to the SCFS project are welcome. Please follow the existing code style and add unit tests for any new or changed functionality.

## License

This project is under MIT license.
