  const express = require('express');
  const router = express.Router();
  const AWS = require('aws-sdk');
  const { v4: uuidv4 } = require('uuid');

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

  router.get('/generate-uuid', (req, res) => {
    const uniqueId = uuidv4();
    res.json({ uniqueId });
  })

  router.get('/upload',(req, res) => {
    const { fileName, fileType } = req.query;

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
      Key: `${fileName}`,
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
    const {folderKey, fileKeys, uniqueId } = req.body;
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
            fileKeys: fileKeys,
            folderKey: folderKey,
            uniqueId: uniqueId
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

  router.get('/check-status', async (req, res) => {
    const {uniqueId, folderKey} = req.query;

    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });

    // Define S3 key for compressed file
    const compressedFileKey = `${uniqueId}/${folderKey}.tar.gz`;

    // Check if the compressed file exists in S3
    const params = {
      Bucket: bucketName,
      Key: compressedFileKey,
    };

    try {
      await s3.headObject(params).promise();
      // If the file exists, send a success response
      const downloadUrl = await getPresignedDownloadUrl(bucketName, compressedFileKey);
      res.json({ status: 'completed', url: downloadUrl });
    } catch (error) {
      if (error.code === 'NotFound') {
        // if file doesnt exist, assume its processing still
        res.status(202);
        res.json({status: 'incomplete' });
      } else {
        res.status(500);
        res.json({ status: 'error', message: error.message });
      }
    }
  });

  async function getPresignedDownloadUrl(bucketName, objectKey) {
    const params = {
      Bucket: bucketName,
      Key: objectKey,
      Expires: 60 * 60 // Expires in 1 hour
    };

    return new Promise((resolve, reject) => {
      s3.getSignedUrl('getObject', params, (err, url) => {
        if (err) {
          reject(err);
        } else {
          resolve(url);
        }
      });
    });
  }

  module.exports = router;