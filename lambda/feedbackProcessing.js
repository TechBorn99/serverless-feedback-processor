const AWS = require("aws-sdk");
const s3 = new AWS.S3();
const sns = new AWS.SNS();
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require("uuid");
const Busboy = require('busboy');

exports.handler = async (event) => {
  try {
    const result = await parseMultipartFormData(event);
    const { feedback, attachments } = result;
    const feedbackId = uuidv4();
    const feedbackType = determineFeedbackType(feedback);
    console.log({})
    await dynamoDb
      .put({
        TableName: process.env.TABLE_NAME,
        Item: {
          id: feedbackId,
          feedback,
          feedbackType,
          timestamp: new Date().toISOString(),
        },
      })
      .promise();

    const snsParameters = {
      Message: `New feedback of type ${feedbackType} received.`,
      TopicArn: process.env.NOTIFICATION_TOPIC_ARN,
    };

    await sns.publish(snsParameters).promise();

    if (attachments && attachments.length > 0) {
      await Promise.all(
        attachments.map(async (attachment) => {
          const attachmentKey = `attachments/${feedbackId}/${attachment.filename}`;
          await s3
            .putObject({
              Bucket: process.env.BUCKET_NAME,
              Key: attachmentKey,
              Body: attachment.content,
              ContentType: attachment.contentType,
            })
            .promise();
        })
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Feedback processed" }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

function determineFeedbackType(feedback) {
  // TODO: Improve this logic per your requirements
  if (feedback.includes("bug")) {
    return "bug";
  } else if (feedback.includes("feature")) {
    return "feature";
  } else {
    return "general";
  }
}

async function parseMultipartFormData(event) {
  return new Promise((resolve, reject) => {
    const contentType =
      event.headers["Content-Type"] || event.headers["content-type"];
    const busboy = Busboy({ headers: { "content-type": contentType } });
    const result = { feedback: null, attachments: [] };

    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
      const fileContent = [];
      file.on("data", (data) => fileContent.push(data));
      file.on("end", () => {
        result.attachments.push({
          content: Buffer.concat(fileContent), // Buffer the file content
          filename,
          contentType: mimetype,
        });
      });
    });

    busboy.on("field", (fieldname, value) => {
      if (fieldname === "feedback") {
        result.feedback = value;
      }
    });

    busboy.on("finish", () => {
      resolve(result);
    });

    busboy.write(event.body, event.isBase64Encoded ? "base64" : "binary");
    busboy.end();
  });
}
