var express = require('express');
var router = express.Router();
const AWS = require('aws-sdk');

AWS.config.update({
    region: "ap-southeast-2",
});

// Initialise s3 variables
const bucketName = 'n11069449-compress-store';
const s3 = new AWS.S3({ apiVersion: "2006-03-01" });

// Initialise sqs variables
const sqs = new AWS.SQS();

router.get('/upload',(req, res) => {
  const fileName = req.query.fileName;
  const fileType = req.query.fileType;

  s3.createBucket({ Bucket: bucketName })
  .promise()
  .then(() => console.log(`Created bucket: ${bucketName}`))
  .catch((err) => {
     // Ignore 409 errors which indicate that the bucket already exists
     if (err.statusCode !== 409) {
         console.log(`Error creating bucket: ${err}`);
     }
  });
  
  const s3Params = {
    Bucket: bucketName,
    Key: fileName,
    Expires: 60,
    ContentType: fileType,
  }

  s3.getSignedUrl('putObject', s3Params, (err, data) => {
    if (err) {
      console.log(err);
      return res.end();
    }
    res.json({
      signedRequest: data,
      url: `https://${s3Params.Bucket}.s3.amazonaws.com/${fileName}`
    });
  }); 
});

router.post('/enqueue', async (req, res) => {
  const queueName = 'n11069449-sqs-queue';

  // Create the queue and wait for the queue to be created.
  try {
    const createQueueData = await sqs.createQueue({
      QueueName: queueName,
      Attributes: {
        DelaySeconds: '60',
        MessageRetentionPeriod: '86400'
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

    res.status(200).send(sendMessageData);
  } catch (err) {
    console.log('Error', err);
    res.status(500).send(err);
  }
});


module.exports = router;