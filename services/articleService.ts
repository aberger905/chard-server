import axios from 'axios';
import db from '../db/rds.config'
import deslugify from '../utils/deslugify';
import AWS from '../AWS.config';
import fs from 'fs';
import path from 'path';
import { parseString, Builder } from 'xml2js';
import * as dotenv from 'dotenv';
dotenv.config();
const ses = new AWS.SES();
const s3 = new AWS.S3();

interface ArticleInput {
  firstName: string;
  lastName: string;
  pronouns: string;
  subject: string;
  story: string;
  articleType: string;
}

class ArticleService {

  private createPrompt = (input: ArticleInput): string => {
    const { firstName, lastName, pronouns, subject, story, articleType } = input;

    let prompt: string;

    if (articleType == 'featured') {
      prompt = `The following prompt has information inserted from our users. You will know when you’re reading user information because it is between <>. For example, <this is a user response>. As a journalist, you are tasked with writing a featured article around 1000 words. This article should revolve around a broader theme, incorporating the story and perspectives of <${firstName} ${lastName}>, pronouns to refer to them by are <${pronouns}>. The broader topic is: <${subject}>. Within this context, <$${firstName} ${lastName}>'s specific experience is: <${story}>. Utilize any quotes from <$${firstName} ${lastName}>'s experience to enrich the article. Ensure the focus remains on the larger theme while highlighting <${firstName} ${lastName}>'s contribution to this topic. I would like the response in JSON format. The JSON object should have two keys: 'title' and 'content'. The 'title' key should have a string value representing the title of the article. The 'content' key should be an array, with each element being a string that represents a section of the article. Each section could be a paragraph, a sentence, or a significant quote. Please ensure all strings are correctly escaped for JSON and formatted as single-line strings within the array to comply with JSON standards.
      `
    } else {
      prompt = `The following prompt has information inserted from our users. You will know when you’re reading user information because it is between <>. For example, <this is a user response>. You are now a news journalist writing a story. Please write roughly a 1000 word news article based on the input provided. The person who should be the sole focus of the article: <${firstName} ${lastName}> , pronouns to refer to them by are <${pronouns}>. The subject of this article will be: <${subject}> Information relevant to the article: <${story}>.  Please do not make up any information. Feel free to add information or speak about the broader subject at hand. If you can find any quotes from the user’s story, please use them. I would like the response in JSON format. The JSON object should have two keys: 'title' and 'content'. The 'title' key should have a string value representing the title of the article. The 'content' key should be an array, with each element being a string that represents a section of the article. Each section could be a paragraph, a sentence, or a significant quote. Please ensure all strings are correctly escaped for JSON and formatted as single-line strings within the array to comply with JSON standards.`
    }

    return prompt;
  }


  saveSubmission = async (input: any) => {
    const { email } = input;
    const queryString = 'INSERT INTO submissions (email, inputs) VALUES ($1, $2) RETURNING submission_id';
    const values = [email, JSON.stringify(input)];
    try {
      const result = await db.query(queryString, values);
      return result.rows[0].submission_id;
    } catch (e) {
      console.error('error in saveSubmission service', e)
    }
  }

  getSubmission = async (submissionId: string | number) => {
    const queryString = 'SELECT inputs FROM submissions WHERE submission_id = $1'
    const values = [submissionId];

    try {
      const result = await db.query(queryString, values);
      return result.rows[0].inputs
    } catch (e) {
      console.error('error in getsubmission service', e);
    }

  }

  checkSubmission = async (submissionId: string | number) => {
    const queryString = 'SELECT processed FROM submissions WHERE submission_id = $1';
    const values = [submissionId];

    try {
      const response = await db.query(queryString, values);
      if (response.rows.length > 0) {
        return response.rows[0].processed; // returns a boolean
      } else {
        return false;
      }
    } catch (e) {
      console.error('error checking submission in checksubmission service', e);
    }
  }

  updateProcessedSubmission = async (submissionId: string | number) => {
    const queryString = 'UPDATE submissions SET processed = TRUE WHERE submission_id = $1';
    const values = [submissionId];

    try {
        await db.query(queryString, values);
    } catch (e) {
        console.error('Error updating submission processed status', e);
        throw e;
    }
  }

  generateArticle = async (input: ArticleInput) => {
    const apiKey = process.env.AI_API_KEY;
    const prompt = this.createPrompt(input)
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: "gpt-4",
        messages: [{ "role": "user", "content": prompt }],
        temperature: 0.7
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        }
      });
      return response.data.choices;
    } catch (error: any) {
      console.error('Error making request:', error.toJSON());
    }

  }

  saveGeneratedArticle = async (article: any, submissionId: number, plan: string, imageUrl: any) => {
  const { title, content } = article;
  const stringifiedContent = JSON.stringify(content);

  const authors = ["Jonathan Parker", "Eliza Maddox", "Oliver Hale", "Ava Chen"];
  const randomIndex = Math.floor(Math.random() * authors.length);
  const selectedAuthor = authors[randomIndex];

  const queryString = 'INSERT INTO articles (submission_id, title, content, plan, image, author) VALUES ($1, $2, $3, $4, $5, $6) RETURNING article_id'
  const values = [submissionId, title, stringifiedContent, plan, imageUrl, selectedAuthor];

  try {
    const response = await db.query(queryString, values);
    const newArticleId = response.rows[0].article_id;
    return newArticleId;
  } catch (e) {
    console.error('error inserting article into db', e);
  }
}

  checkStatus = async (submissionId: any) => {
    const queryString = `SELECT * FROM articles WHERE submission_id = $1`;
    const values = [submissionId];

    try {
      const response = await db.query(queryString, values);
      if (response.rows.length > 0) {
        return { status: 'ready', articleId: response.rows[0].article_id };
      } else {
        return { status: 'not ready'};
      }
    } catch (e) {
      console.error('error in checkStatus service', e);
    }
  }

  getSavedArticle = async (slug: string): Promise<any> => {
    const id = deslugify(slug);
    const queryString = 'SELECT * FROM articles WHERE article_id = $1';
    const values = [id];

    try {
      const response = await db.query(queryString, values);
      return response.rows[0] || null;
    } catch (e) {
      console.error('error getting article in article service', e)
    }
  }

  getEmailByArticleId = async (articleId: number) => {
    const queryString = `
      SELECT submissions.email
      FROM submissions
      JOIN articles ON submissions.submission_id = articles.submission_id
      WHERE articles.article_id = $1;
    `;
    const values = [articleId];

    try {
      const result = await db.query(queryString, values);
      if (result.rows.length > 0) {
        return result.rows[0].email;
      } else {
        return null;
      }
    } catch (e) {
      console.error('Error in getEmailByArticleId')
    }
  }

  sendEmail = async (slug: string, email: string) => {

    const params = {
      Source: 'support@journova.org', // Replace with your verified SES sender email
      Destination: {
        ToAddresses: [email] // The recipient's email address
      },
      Message: {
        Subject: {
          Data: '🌟 Your Story is Now Published! Discover Your Article on Vista World News 🌟'
        },
        Body: {
          Html: {
            Data: `
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; }
                h1 { color: #333366; }
                h2 { color: #333399; }
                p { color: #333333; }
                a { color: #1a0dab; text-decoration: none; }
                .footer { margin-top: 20px; font-style: italic; }
              </style>
            </head>
            <body>
              <h1>We are thrilled to share that your article, “[Article Title]”, is now published!</h1>
              <p>This marks a significant milestone in your journey with us, and we couldn't be more excited to see the impact your story will have.</p>

              <h2>Experience Your Published Work</h2>
              <p>You can view and share your published article by visiting the link below:</p>
              <a href="${process.env.NEWS_DOMAIN}/${slug}">View Your Article</a>

              <h2>Share Your Achievement</h2>
              <p>Feel free to share this link with friends, family, and your network. Your unique insights and experiences are now out there to educate, inspire, and resonate with readers across the globe.</p>

              <h2>A Heartfelt Thank You</h2>
              <p>We want to take a moment to thank you for entrusting us with your narrative. It has been an absolute pleasure working with you to bring your story to life. Your courage and honesty in sharing your experiences are what make our community of storytellers so special.</p>

              <h2>We'd Love Your Feedback</h2>
              <p>We are always looking to improve the experiences of our contributors. If you have any thoughts or feedback about your journey with us, we would love to hear from you.</p>

              <div class="footer">
                <p>Thank you once again for being a vital part of our storytelling community. We look forward to the possibility of collaborating with you again in the future!</p>
                <p>Warm regards,</p>
                <p>The Journova Team</p>
              </div>
            </body>
            </html>
            `
          }
        }
      }
    };

    try {
      const response = await ses.sendEmail(params).promise();
    } catch (error) {
      console.error('Error sending email:', error);
    }
  };

  sendPublishedEmail = async (email: string, slug: string, title: string) => {
    try {
      const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: {
          name: "Journova",
          email: "support@journova.org"
        },
        to: [
          {
            email: email,
            name: "You"
          }
        ],
        subject: `🌟 Your Story is Now Published! Discover Your Article on Vista World News 🌟`,
        htmlContent: `
        <html>
            <head>
                <style>
                    body {
                        background-color: #ffffff;
                        color: #333333;
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                    }
                    .email-container {
                        max-width: 600px;
                        margin: 20px auto;
                        padding: 20px;
                        border: 1px solid #dddddd;
                        border-radius: 5px;
                        background-color: #ffffff;
                    }
                    .email-header {
                        text-align: center;
                        padding-bottom: 20px;
                    }
                    .email-content {
                        line-height: 1.5;
                        color: #333333;
                    }
                    .email-footer {
                        margin-top: 30px;
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <div class="email-container">
                    <div class="email-header">
                        <img src="https://journova.s3.us-east-2.amazonaws.com/Screen+Shot+2023-12-29+at+3.29.00+PM.png" alt="Journova Logo" width="150">
                    </div>
                    <div class="email-content">
                        <p>The article titled “${title}” has been published!</p>

                        <p>Here is the direct link to your published article: <a href="${process.env.NEWS_DOMAIN}/${slug}"><b>Your Headline Story</b></a></p>

                        <p><b>PRINT IT! POST IT! SHARE IT!</b></p>

                        <p>Here is a link to download and print your article: <a href="${process.env.JOURNOVA_DOMAIN}/my-article/${slug}">My Story</a></p>

                        <p>Thank you for sharing your story and for allowing us to craft it into something we’re both proud of!</p>

                        <p>Finally, we’re always looking to improve the experience of our contributors like you!  If you would be willing to share your thoughts, please respond to this email directly with any suggestions you may have.</p>

                        <p>Thanks again,</p>
                    </div>
                    <div class="email-footer">
                        <p>Your friends at <b>Journova</b></p>
                    </div>
                </div>
            </body>
            </html> `
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_KEY,
          'content-type': 'application/json'
        }
      });

      console.log("Email sent successfully:", response.data);
    } catch (error) {
      console.error("Error sending email:", error);
    }

  }

  sendConfirmationEmail = async (email: string, firstName: string) => {
    try {
      const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: {
          name: "Journova",
          email: "support@journova.org"
        },
        to: [
          {
            email: email,
            name: firstName
          }
        ],
        subject: `Congratulations, ${firstName}! Your Story Received`,
        htmlContent: `
        <html>
        <head>
            <style>
                body {
                    background-color: #ffffff;
                    color: #333333;
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                }
                .email-container {
                    max-width: 600px;
                    margin: 20px auto;
                    padding: 20px;
                    border: 1px solid #dddddd;
                    border-radius: 5px;
                    background-color: #ffffff;
                }
                .email-header {
                    text-align: center;
                    padding-bottom: 20px;
                }
                .email-content {
                    line-height: 1.5;
                    color: #333333;
                }
                .email-footer {
                    margin-top: 30px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <img src="https://journova.s3.us-east-2.amazonaws.com/Screen+Shot+2023-12-29+at+3.29.00+PM.png" alt="Journova Logo" width="150">
                </div>
                <div class="email-content">
                    <p>Thank you, <b>${firstName}</b>, for the opportunity to write your story!</p>

                    <p>In the next 72 hours, the team at <b>Journova</b> will be reviewing your information, conducting research, and drafting an article for editorial review.</p>

                    <p>Once complete, you will receive your article by email. You are free to download and print it as you wish!</p>

                    <p>Please respond to this email with any questions or comments.</p>
                </div>
                <div class="email-footer">
                    <p>Your friends at <b>Journova</b></p>
                </div>
            </div>
        </body>
        </html>`
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_KEY,
          'content-type': 'application/json'
        }
      });

      console.log("Email sent successfully:", response.data);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  }

  sendConfirmationEmail2 = async (email: string, firstName: string) => {
    try {
      const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: {
          name: "Journova",
          email: "support@journova.org"
        },
        to: [
          {
            email: email,
            name: firstName
          }
        ],
        subject: `Congratulations, ${firstName}! Your Story Received`,
        htmlContent: `
        <html>
        <head>
            <style>
                body {
                    background-color: #ffffff;
                    color: #333333;
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                }
                .email-container {
                    max-width: 600px;
                    margin: 20px auto;
                    padding: 20px;
                    border: 1px solid #dddddd;
                    border-radius: 5px;
                    background-color: #ffffff;
                }
                .email-header {
                    text-align: center;
                    padding-bottom: 20px;
                }
                .email-content {
                    line-height: 1.5;
                    color: #333333;
                }
                .email-footer {
                    margin-top: 30px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <img src="https://journova.s3.us-east-2.amazonaws.com/Screen+Shot+2023-12-29+at+3.29.00+PM.png" alt="Journova Logo" width="150">
                </div>
                <div class="email-content">
                    <p>Thank you, <b>${firstName}</b>, for the opportunity to write your story!</p>

                    <p>In the next 48 hours, the team at <b>Journova</b> will be reviewing your information, conducting research, and drafting an article for editorial review.</p>

                    <p>Please look for a draft of that article in your email. Once received, we request that you review the article, agree to the terms and conditions and approve the article for publication.</p>

                    <p>Please respond to this email with any questions or comments.</p>
                </div>
                <div class="email-footer">
                    <p>Your friends at <b>Journova</b></p>
                </div>
            </div>
        </body>
        </html> `
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_KEY,
          'content-type': 'application/json'
        }
      });

      console.log("Email sent successfully:", response.data);
    } catch (error) {
      console.error("Error sending email:", error);
    }

  }

  sendConfirmationEmail3 = async (email: string, firstName: string) => {
    try {
      const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: {
          name: "Journova",
          email: "support@journova.org"
        },
        to: [
          {
            email: email,
            name: firstName
          }
        ],
        subject: `Congratulations, ${firstName}! Your Story Received`,
        htmlContent: `
        <html>
            <head>
                <style>
                    body {
                        background-color: #ffffff;
                        color: #333333;
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                    }
                    .email-container {
                        max-width: 600px;
                        margin: 20px auto;
                        padding: 20px;
                        border: 1px solid #dddddd;
                        border-radius: 5px;
                        background-color: #ffffff;
                    }
                    .email-header {
                        text-align: center;
                        padding-bottom: 20px;
                    }
                    .email-content {
                        line-height: 1.5;
                        color: #333333;
                    }
                    .email-footer {
                        margin-top: 30px;
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <div class="email-container">
                    <div class="email-header">
                        <img src="https://journova.s3.us-east-2.amazonaws.com/Screen+Shot+2023-12-29+at+3.29.00+PM.png" alt="Journova Logo" width="150">
                    </div>
                    <div class="email-content">
                        <p>Thank you, <b>${firstName}</b>, for the opportunity to write your story!</p>

                        <p>In the next few hours, the team at <b>Journova</b> will be reviewing your information, conducting research, and drafting an article for editorial review.</p>

                        <p>Please look for a draft of that article in your email within <b>12 hours</b>. Once received, we request that you review the article, and approve the article for publication or request a revision.</p>

                        <p>Please respond to this email with any questions or comments.</p>
                    </div>
                    <div class="email-footer">
                        <p>Your friends at <b>Journova</b></p>
                    </div>
                </div>
            </body>
            </html> `
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_KEY,
          'content-type': 'application/json'
        }
      });

      console.log("Email sent successfully:", response.data);
    } catch (error) {
      console.error("Error sending email:", error);
    }

  }

  sendEditorialEmail = async (email: string, firstName: string, title: string) => {

    try {
      const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: {
          name: "Journova",
          email: "support@journova.org"
        },
        to: [
          {
            email: email,
            name: firstName
          }
        ],
        subject: `Status Update – Your Story Has Been Written!`,
        htmlContent: `
        <html>
        <head>
            <style>
                body {
                    background-color: #ffffff;
                    color: #333333;
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                }
                .email-container {
                    max-width: 600px;
                    margin: 20px auto;
                    padding: 20px;
                    border: 1px solid #dddddd;
                    border-radius: 5px;
                    background-color: #ffffff;
                }
                .email-header {
                    text-align: center;
                    padding-bottom: 20px;
                }
                .email-content {
                    line-height: 1.5;
                    color: #333333;
                }
                .email-footer {
                    margin-top: 30px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <img src="https://journova.s3.us-east-2.amazonaws.com/Screen+Shot+2023-12-29+at+3.29.00+PM.png" alt="Journova Logo" width="150">
                </div>
                <div class="email-content">
                    <p>The article titled <b>“${title}”</b> has been written.</p>

                    <p>Are you excited, ${firstName}?</p>

                    <p>Once our editorial team reviews and polishes your article, we’ll complete the order and send it to you.</p>

                    <p>Please respond to this email with any questions or comments.</p>
                </div>
                <div class="email-footer">
                    <p>Your friends at <b>Journova</b></p>
                </div>
            </div>
        </body>
        </html> `
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_KEY,
          'content-type': 'application/json'
        }
      });

      console.log("Email sent successfully:", response.data);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  }

  sendEditorialEmail2 = async (email: string, firstName: string, title: string) => {

    try {
      const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: {
          name: "Journova",
          email: "support@journova.org"
        },
        to: [
          {
            email: email,
            name: firstName
          }
        ],
        subject: `Status Update – Your Story Has Been Written!`,
        htmlContent: `
        <html>
        <head>
            <style>
                body {
                    background-color: #ffffff;
                    color: #333333;
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                }
                .email-container {
                    max-width: 600px;
                    margin: 20px auto;
                    padding: 20px;
                    border: 1px solid #dddddd;
                    border-radius: 5px;
                    background-color: #ffffff;
                }
                .email-header {
                    text-align: center;
                    padding-bottom: 20px;
                }
                .email-content {
                    line-height: 1.5;
                    color: #333333;
                }
                .email-footer {
                    margin-top: 30px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <img src="https://journova.s3.us-east-2.amazonaws.com/Screen+Shot+2023-12-29+at+3.29.00+PM.png" alt="Journova Logo" width="150">
                </div>
                <div class="email-content">
                    <p>The article titled <b>“${title}”</b> has been written.</p>

                    <p>Are you excited, ${firstName}?</p>

                    <p>Once our editorial team reviews and polishes your article, we’ll complete the order and send it to you for review and publication.  </p>

                    <p>Please respond to this email with any questions or comments.</p>
                </div>
                <div class="email-footer">
                    <p>Your friends at <b>Journova</b></p>
                </div>
            </div>
        </body>
        </html> `
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_KEY,
          'content-type': 'application/json'
        }
      });

      console.log("Email sent successfully:", response.data);
    } catch (error) {
      console.error("Error sending email:", error);
    }

  }





  sendReviewEmail = async (email: string, firstName: string, title: string, slug: string) => {

    try {
      const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: {
          name: "Journova",
          email: "support@journova.org"
        },
        to: [
          {
            email: email,
            name: firstName
          }
        ],
        subject: `Your Story Has Been Delivered!`,
        htmlContent: `
        <html>
        <head>
            <style>
                body {
                    background-color: #ffffff;
                    color: #333333;
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0;
                }
                .email-container {
                    max-width: 600px;
                    margin: 20px auto;
                    padding: 20px;
                    border: 1px solid #dddddd;
                    border-radius: 5px;
                    background-color: #ffffff;
                }
                .email-header {
                    text-align: center;
                    padding-bottom: 20px;
                }
                .email-content {
                    line-height: 1.5;
                    color: #333333;
                }
                .email-footer {
                    margin-top: 30px;
                    text-align: center;
                }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <img src="https://journova.s3.us-east-2.amazonaws.com/Screen+Shot+2023-12-29+at+3.29.00+PM.png" alt="Journova Logo" width="150">
                </div>
                <div class="email-content">
                    <p>The article titled <b>“${title}”</b> is attached below!</p>

                    <p><b>PRINT IT! FRAME IT!</b></p>

                    <p><a href="${process.env.JOURNOVA_DOMAIN}/my-article/${slug}">My Story</a></p>

                    <p>Thank you for sharing your story and for allowing us to craft it into something we’re both proud of!</p>

                    <p>Finally, we’re always looking to improve the experience of our contributors like you ${firstName}!  If you would be willing to share your thoughts, please respond to this email directly with any suggestions you may have.</p>

                    <p>Thanks again,</p>
                </div>
                <div class="email-footer">
                    <p>Your friends at <b>Journova</b></p>
                </div>
            </div>
        </body>
        </html> `
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_KEY,
          'content-type': 'application/json'
        }
      });

      console.log("Email sent successfully:", response.data);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  }

  sendReviewEmail2 = async (email: string, firstName: string, title: string, slug: string) => {

    try {
      const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: {
          name: "Journova",
          email: "support@journova.org"
        },
        to: [
          {
            email: email,
            name: firstName
          }
        ],
        subject: `Status Update – Your Story Has Been Approved!`,
        htmlContent: `
        <html>
            <head>
                <style>
                    body {
                        background-color: #ffffff;
                        color: #333333;
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                    }
                    .email-container {
                        max-width: 600px;
                        margin: 20px auto;
                        padding: 20px;
                        border: 1px solid #dddddd;
                        border-radius: 5px;
                        background-color: #ffffff;
                    }
                    .email-header {
                        text-align: center;
                        padding-bottom: 20px;
                    }
                    .email-content {
                        line-height: 1.5;
                        color: #333333;
                    }
                    .email-footer {
                        margin-top: 30px;
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <div class="email-container">
                    <div class="email-header">
                        <img src="https://journova.s3.us-east-2.amazonaws.com/Screen+Shot+2023-12-29+at+3.29.00+PM.png" alt="Journova Logo" width="150">
                    </div>
                    <div class="email-content">
                        <p>The article titled <b>“${title}”</b> has been approved by our editorial team.</p>

                        <p>To review and approve for publication click here: <a href="${process.env.JOURNOVA_DOMAIN}/preview/${slug}"><b>My Story</b></a></p>

                        <p>Once approved, the article will be scheduled for publication within the next 24 hours and you’ll receive a confirmation with a link to the news source.</p>

                        <p>Please respond to this email with any questions or comments.</p>
                    </div>
                    <div class="email-footer">
                        <p>Your friends at <b>Journova</b></p>
                    </div>
                </div>
            </body>
            </html>`
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_KEY,
          'content-type': 'application/json'
        }
      });

      console.log("Email sent successfully:", response.data);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  }

  sendReviewEmail3 = async (email: string, firstName: string, title: string, slug: string) => {
    try {
      const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: {
          name: "Journova",
          email: "support@journova.org"
        },
        to: [
          {
            email: email,
            name: firstName
          }
        ],
        subject: `Status Update – Your Story Has Been Approved!`,
        htmlContent: `
        <html>
            <head>
                <style>
                    body {
                        background-color: #ffffff;
                        color: #333333;
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                    }
                    .email-container {
                        max-width: 600px;
                        margin: 20px auto;
                        padding: 20px;
                        border: 1px solid #dddddd;
                        border-radius: 5px;
                        background-color: #ffffff;
                    }
                    .email-header {
                        text-align: center;
                        padding-bottom: 20px;
                    }
                    .email-content {
                        line-height: 1.5;
                        color: #333333;
                    }
                    .email-footer {
                        margin-top: 30px;
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <div class="email-container">
                    <div class="email-header">
                        <img src="https://journova.s3.us-east-2.amazonaws.com/Screen+Shot+2023-12-29+at+3.29.00+PM.png" alt="Journova Logo" width="150">
                    </div>
                    <div class="email-content">
                        <p>The article titled <b>“${title}”</b> has been approved by our editorial team.</p>

                        <p>To review and approve for publication click here: <a href="${process.env.JOURNOVA_DOMAIN}/preview/${slug}"><b>My Story</b></a></p>

                        <p>Once approved, the article will be scheduled for publication within the next 24 hours and you’ll receive a confirmation with a link to the news source.</p>

                        <p>Please respond to this email with any questions or comments.</p>
                    </div>
                    <div class="email-footer">
                        <p>Your friends at <b>Journova</b></p>
                    </div>
                </div>
            </body>
            </html> `
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_KEY,
          'content-type': 'application/json'
        }
      });

      console.log("Email sent successfully:", response.data);
    } catch (error) {
      console.error("Error sending email:", error);
    }

  }



  private createRevisionPrompt = (article: any, input: string) => {
    const prompt = `As a journalist, you are tasked with revising the given news article. Please provide a detailed revision of the attached news article based on the user's feedback. Focus on areas highlighted by the user, such as specific factual corrections, adjustments in tone, style, or additional context. Aim to address all points raised while maintaining the article's overall coherence and journalistic integrity. Any subjective or stylistic changes should align with the article's objective nature. Your thorough and balanced approach in integrating these revisions is crucial. the title of the news article is: ${article.title}, the content of the news article is: ${article.content}. Here are the revision notes straight from the user: ${input}. Please return the fully revised article back. I would like the response in JSON format. The JSON object should have two keys: 'title' and 'content'. The 'title' key should have a string value representing the title of the article. The 'content' key should be an array, with each element being a string that represents a section of the article. Each section could be a paragraph, a sentence, or a significant quote. Please ensure all strings are correctly escaped for JSON and formatted as single-line strings within the array to comply with JSON standards.`

    return prompt;
  }

  generateRevision = async (article: any, input: string) => {
    const prompt = this.createRevisionPrompt(article, input);
    console.log('REVISION PROMPT', prompt)
    const apiKey = process.env.AI_API_KEY;
    console.log('INSIDE GENERATE REVISION SERVICE')
      try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: "gpt-4",
          messages: [{ "role": "user", "content": prompt }],
          temperature: 0.7
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          }
        });
        return response.data.choices;
      } catch (error: any) {
        console.error('Error making request:', error.toJSON());
      }
  }

  saveRevisedArticle = async (article: any, articleId: any) => {
    const queryString = 'UPDATE articles SET revised = $1 WHERE article_id = $2';
    const values = [article, articleId];
    try {
      await db.query(queryString, values);
    } catch (e) {
      console.error('error in saveRevisedArticle service', e);
    }
  };

  sendRevisionEmail = async (email: string, slug: string) => {

    try {
      const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
        sender: {
          name: "Journova",
          email: "support@journova.org"
        },
        to: [
          {
            email: email,
            name: "You"
          }
        ],
        subject: `Your Revised Article is Ready for Review - Take a Look!`,
        htmlContent: `
        <html>
            <head>
                <style>
                    body {
                        background-color: #ffffff;
                        color: #333333;
                        font-family: Arial, sans-serif;
                        margin: 0;
                        padding: 0;
                    }
                    .email-container {
                        max-width: 600px;
                        margin: 20px auto;
                        padding: 20px;
                        border: 1px solid #dddddd;
                        border-radius: 5px;
                        background-color: #ffffff;
                    }
                    .email-header {
                        text-align: center;
                        padding-bottom: 20px;
                    }
                    .email-content {
                        line-height: 1.5;
                        color: #333333;
                    }
                    .email-footer {
                        margin-top: 30px;
                        text-align: center;
                    }
                </style>
            </head>
            <body>
                <div class="email-container">
                    <div class="email-header">
                        <img src="https://journova.s3.us-east-2.amazonaws.com/Screen+Shot+2023-12-29+at+3.29.00+PM.png" alt="Journova Logo" width="150">
                    </div>
                    <div class="email-content">
                        <p>Following your valuable feedback, our team has fine-tuned your article. We've focused on making the revisions you've requested to ensure your story is shared just the way you envisioned it.</p>

                        <h2>Review the Changes</h2>
                        <p>Please take a moment to review the revised version of your article. Your final approval is crucial before we move forward with publishing.</p>
                        <a href="${process.env.JOURNOVA_DOMAIN}/revision/${slug}">Review Your Revised Article</a>

                        <p>Please respond to this email with any questions or comments.</p>
                    </div>
                    <div class="email-footer">
                        <p>Your friends at <b>Journova</b></p>
                    </div>
                </div>
            </body>
            </html> `
      }, {
        headers: {
          'accept': 'application/json',
          'api-key': process.env.BREVO_KEY,
          'content-type': 'application/json'
        }
      });

      console.log("Email sent successfully:", response.data);
    } catch (error) {
      console.error("Error sending email:", error);
    }

  }

  getSavedRevisedArticle = async (articleId: any) => {
   const queryString = 'SELECT * FROM articles WHERE article_id = $1'
   const values = [articleId];

   try {
    const response = await db.query(queryString, values);
    return response.rows[0];
   } catch (e) {
    console.error('error in the getSavedRevisedArticle Service', e)
   }

  }

  updateSitemap = async (slug: string) => {

    const params = {
      Bucket: 'journova',
      Key: 'sitemap.xml'
    };

    try {
      // Read the sitemap.xml from S3
      const data: any = await s3.getObject(params).promise();
      const xml = data.Body.toString('utf-8');

      parseString(xml, async (err, result) => {
        if (err) {
          console.error(err);
          return;
        }

        const newUrl = {
          loc: `https://vistaworldnews.com/${slug}`,
          lastmod: new Date().toISOString().split('T')[0], // format as YYYY-MM-DD
          changefreq: 'weekly',
          priority: 0.8
        };

        result.urlset.url.push(newUrl);

        const builder = new Builder();
        const updatedXml = builder.buildObject(result);

        // Write the updated XML back to S3
        const uploadParams = {
          Bucket: 'journova',
          Key: 'sitemap.xml',
          Body: updatedXml,
          ContentType: 'application/xml'
        };
        await s3.putObject(uploadParams).promise();
        console.log('Sitemap updated and uploaded to S3');
      });
    } catch (err) {
      console.error('Error updating sitemap:', err);
    }
  };


  publish = async (articleId: number) => {
     const queryString = 'UPDATE articles SET published = $1, date_published = CURRENT_DATE WHERE article_id = $2'
     const values = [true, articleId];
     try {
      await db.query(queryString, values);
      return;
     } catch (e) {
      console.error('error updating in published service', e);
     }
  }

  publishRevision = async (articleId: number) => {
    const slug = `title-of-article-${articleId}`;
    const article = await this.getSavedArticle(slug);

    const revisedArticle = article.revised;

    const queryString = 'UPDATE articles SET title = $1, content = $2, published = $3 WHERE article_id = $4';
    const values = [revisedArticle.title, JSON.stringify(revisedArticle.content), true, articleId];

    try {
      await db.query(queryString, values);
    } catch (e) {
      console.error('error inside publish revision service', e);
    }
  };

  uploadImage = async (fileContent: any, fileName: string, mimeType: string) => {
    console.log('HERE INSIDE UPLOADIMAGE SERVICE');
    const params = {
      Bucket: 'journova',
      Key: fileName,
      Body: fileContent,
      ContentType: mimeType
    };

    try {
      const data = await s3.upload(params).promise();
      console.log('File uploaded successfully', data.Location);
      return data.Location;
    } catch (e) {
      console.error('Error uploading file', e);
    }
  }




}

export default  ArticleService;