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

    const prompt = `The following prompt has information inserted from our users. You will know when you’re reading user information because it is between <>. For example, <this is a user response>. You are now a news journalist writing a story. Please write roughly a 100 word news article based on the input provided. The person who should be the sole focus of the article: <${fullName}> , pronouns to refer to them by are <${pronouns}>. The subject of this article will be: <${subject}> Information relevant to the article: <${story}>.  Please do not make up any information. Feel free to add information or speak about the broader subject at hand. If you can find any quotes from the user’s story, please use them. I want the response to be in a JSON string, where the object has the key "title", with its value being a string of the title, and another key "content", the value is an array, each element of this array is the content of each part in order, where a natural break would be, even if they are single sentences for quotes etc.`
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

  sendConfirmationEmail = async (email: string) => {
    const params = {
      Source: 'support@journova.org', // verified SES sender email
      Destination: {
        ToAddresses: [email] // The recipient's email address
      },
      Message: {
        Subject: {
          Data: "Your Story's Journey Begins - Submission Confirmed!"
        },
        Body: {
          Text: {
            Data: `
            Congratulations on Taking the First Step!

            We are delighted to inform you that we have received your story submission. Our team of skilled journalists is brimming with excitement and ready to bring your unique narrative to life.

            Here's What Happens Next:

            Stay Informed: We believe in keeping you closely involved in every step of the process. You can expect regular updates via email, keeping you informed of the progress we make with your article.

            Review and Approval: Crafting your story is a collaborative process. Once our team has intricately woven your narrative, you will have the opportunity to review it. This stage ensures that your voice and message shine through in every word.

            Ready for the World: With your approval, we will take the final steps to prepare your article for publishing. The moment your story is ready to be shared with the world, you will be the first to know!

            We deeply appreciate your contribution to our storytelling journey. Your story is now in the caring and capable hands of our dedicated team. As we embark on this creative endeavor, we share in your anticipation and excitement.

            Keep an eye on your inbox for the latest updates and for the grand reveal of your completed article. Should you have any questions in the meantime, please feel free to reach out.`
          }
        }
      }
    };

    try {
      const response = await ses.sendEmail(params).promise();
    } catch (error) {
      console.error('Error sending email:', error);
    }
  }

  sendEditorialEmail = async (email: string, title: string) => {
    const params = {
      Source: 'support@journova.org', // verified SES sender email
      Destination: {
        ToAddresses: [email] // The recipient's email address
      },
      Message: {
        Subject: {
          Data: 'Exciting News: Your Article Has Entered the Editorial Stage!'
        },
        Body: {
          Text: {
            Data: `We are thrilled to inform you that your article, titled "${title}", has officially entered the editorial process! This is a significant milestone in bringing your story to life, and our team of expert editors is eager to work their magic.

            What Happens Next?
            Our editorial team will meticulously review and polish your article, ensuring every word resonates with your intended message and audience. We're dedicated to preserving the authenticity of your narrative while enhancing its clarity and impact.

            Stay Tuned for Updates
            Throughout this process, we'll keep you in the loop with regular updates. You'll be the first to know when your article is ready for the next step.

            We're honored to be a part of your storytelling journey and can't wait to showcase your article. Thank you for trusting us with your experiences and ideas.

            Warm regards,

            The Journova Team`
          }
        }
      }
    };

    try {
      const response = await ses.sendEmail(params).promise();
    } catch (error) {
      console.error('Error sending email:', error);
    }
  }

  sendReviewEmail = async (slug: string, email: string) => {

    const params = {
      Source: 'support@journova.org', // Replace with your verified SES sender email
      Destination: {
        ToAddresses: [email] // The recipient's email address
      },
      Message: {
        Subject: {
          Data: 'Your Story Awaits: Review Your Completed Article Now!' // Email subject
        },
        Body: {
          Text: {
            Data: `We are excited to announce that your article, “[Article Title]”, is now beautifully crafted and ready for your review!

            Ready for the Spotlight
            Our editorial team has worked diligently to ensure that your story is told in the most compelling and authentic way possible. We believe that it's not just an article; it's a piece of art that reflects your unique journey and insights.

            Review and Submit for Publication
            It’s now your turn to take a look at the final piece. Please review the article at your earliest convenience to give it your stamp of approval.

            🔗 http://localhost:5173/${slug}

            Next Steps
            Once you review and approve the article, we will proceed with publishing it, showcasing your story to the world. We can’t wait to share it with our audience!

            Questions or Feedback?
            If you have any questions or need assistance, our team is here to help. Feel free to reach out at any time.

            Thank you for sharing your story with us and for being an integral part of this creative journey. We are thrilled to be a part of bringing your voice to a wider audience.

            Warm regards,

            The Journova Team` // Email body
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