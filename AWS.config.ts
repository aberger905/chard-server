import AWS from 'aws-sdk';
import * as dotenv from 'dotenv';
dotenv.config();


// Configure AWS SES
AWS.config.update({
    region: 'us-east-2', // replace with your AWS SES region
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY
});

export default AWS;