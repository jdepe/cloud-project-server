var express = require('express');
var router = express.Router();
const AWS = require('aws-sdk');

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: "ap-southeast-2",
});

// Initialise s3 variables
const bucketName = 'n11069449-compress-store';
const s3 = new AWS.S3({ apiVersion: "2006-03-01" });

// Initialise sqs variables
const sqs = new AWS.SQS({ region: 'ap-southeast-2'});

console.log("Access Key:", process.env.AWS_ACCESS_KEY_ID);

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
  const params = {
    MessageBody: JSON.stringify({ 
      fileKeys: req.body.fileKeys,
      folderKey: req.body.folderKey
     }),
    QueueUrl: 'your-sqs-queue-url'
  };

  sqs.sendMessage(params, (err, data) => {
    if (err) res.status(500).send(err);
    else res.status(200).send(data);
  });
});

module.exports = router;