import axios from 'axios';
import db from '../db/rds.config'
import deslugify from '../utils/deslugify';
import AWS from '../AWS.config';
import * as dotenv from 'dotenv';
dotenv.config();
const ses = new AWS.SES();

interface ArticleInput {
  fullName: string;
  pronouns: string;
  subject: string;
  story: string;
}

class ArticleService {

  private createPrompt = (input: ArticleInput): string => {
    const { fullName, pronouns, subject, story } = input;

    const prompt = `The following prompt has information inserted from our users. You will know when you’re reading user information because it is between <>. For example, <this is a user response>. You are now a news journalist writing a story. Please write roughly a 1000 word news article based on the input provided. The person who should be the sole focus of the article: <${fullName}> , pronouns to refer to them by are <${pronouns}>. The subject of this article will be: <${subject}> Information relevant to the article: <${story}>.  Please do not make up any information. Feel free to add information or speak about the broader subject at hand. If you can find any quotes from the user’s story, please use them. I want the response to be in a JSON string, where the object has the key "title", with its value being a string of the title, and another key "content", the value is an array, each element of this array is the content of each part in order, where a natural break would be, even if they are single sentences for quotes etc.`
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

  saveGeneratedArticle = async (article: any, submissionId: number) => {
  const { title, content } = article;
  const stringifiedContent = JSON.stringify(content);

  const queryString = 'INSERT INTO articles (submission_id, title, content) VALUES ($1, $2, $3) RETURNING article_id'
  const values = [submissionId, title, stringifiedContent]

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
          Data: 'Congratulations! Your Article is Published' // Email subject
        },
        Body: {
          Text: {
            Data: `Your article is ready! You can view it here: http://localhost:5173/${slug}` // Email body
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

}

export default  ArticleService;