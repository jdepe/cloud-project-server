const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: "ap-southeast-2",
});

// Initialise s3 variables
const s3 = new AWS.S3({ apiVersion: "2006-03-01" });
const bucketName = 'n11069449-compress-store';


// Initialise sqs variables
const sqs = new AWS.SQS();
const queueName = 'n11069449-sqs-queue';

router.get('/upload',(req, res) => {
  const fileName = req.query.fileName;
  const fileType = req.query.fileType;

  // Create bucket if it does not exist, do nothing if it does.
  s3.createBucket({ Bucket: bucketName })
  .promise()
  .then(() => console.log(`Created bucket: ${bucketName}`))
  .catch((err) => {
     // Ignore 409 errors which indicate that the bucket already exists
     if (err.statusCode !== 409) {
         console.log(`Error creating bucket: ${err}`);
     }
  });
  
  // Setup params to generate presigned url that expires in 60 seconds
  const s3Params = {
    Bucket: bucketName,
    Key: fileName,
    Expires: 60,
    ContentType: fileType,
  }

  s3.getSignedUrl('putObject', s3Params, (err, data) => {
    if (err) {
      console.log(err);
      res.status(500);
      res.json({ status: "Error", message: "Could not generate the pre-signed S3 url." });
    } else {
      res.json({
        signedRequest: data,
        url: `https://${s3Params.Bucket}.s3.amazonaws.com/${fileName}`
      });
    }
  }); 
});

router.post('/enqueue', async (req, res) => {
  // Create the queue and wait for the queue to be created.
  try {
    const createQueueData = await sqs.createQueue({
      QueueName: queueName,
      Attributes: {
        DelaySeconds: '60',   // Messages in the queue won't be visible to consumers for 60 seconds
        MessageRetentionPeriod: '86400'   // Retain unprocessed messages for 1 day (24 * 60 * 60 seconds)
      }
    }).promise();

    const queueUrl = createQueueData.QueueUrl;

    const sendMessageData = await sqs.sendMessage({
      MessageBody: JSON.stringify({ 
          fileKeys: req.body.fileKeys,
          folderKey: req.body.folderKey
        }),
      QueueUrl: queueUrl
    }).promise();

    res.status(200);
    res.json(sendMessageData);
  } catch (err) {
    console.log('Error', err);
    res.status(500)
    res.json({ status: "Error", message: "Failed to queue the file compression." });
  }
});


module.exports = router;