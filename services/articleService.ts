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
  articleType: string;
}

class ArticleService {

  private createPrompt = (input: ArticleInput): string => {
    const { fullName, pronouns, subject, story, articleType } = input;

    let prompt: string;

    if (articleType == 'featured') {
      prompt = `The following prompt has information inserted from our users. You will know when you’re reading user information because it is between <>. For example, <this is a user response>. As a journalist, you are tasked with writing a featured article around 1000 words. This article should revolve around a broader theme, incorporating the story and perspectives of <${fullName}>, who uses <${pronouns}> pronouns. The broader topic is: <${subject}>. Within this context, <${fullName}>'s specific experience is: <${story}>. Utilize any quotes from <${fullName}>'s experience to enrich the article. Ensure the focus remains on the larger theme while highlighting <${fullName}>'s contribution to this topic. I would like the response in JSON format. The JSON object should have two keys: 'title' and 'content'. The 'title' key should have a string value representing the title of the article. The 'content' key should be an array, with each element being a string that represents a section of the article. Each section could be a paragraph, a sentence, or a significant quote. Please ensure all strings are correctly escaped for JSON and formatted as single-line strings within the array to comply with JSON standards.
      `
    } else {
      prompt = `The following prompt has information inserted from our users. You will know when you’re reading user information because it is between <>. For example, <this is a user response>. You are now a news journalist writing a story. Please write roughly a 100 word news article based on the input provided. The person who should be the sole focus of the article: <${fullName}> , pronouns to refer to them by are <${pronouns}>. The subject of this article will be: <${subject}> Information relevant to the article: <${story}>.  Please do not make up any information. Feel free to add information or speak about the broader subject at hand. If you can find any quotes from the user’s story, please use them. I would like the response in JSON format. The JSON object should have two keys: 'title' and 'content'. The 'title' key should have a string value representing the title of the article. The 'content' key should be an array, with each element being a string that represents a section of the article. Each section could be a paragraph, a sentence, or a significant quote. Please ensure all strings are correctly escaped for JSON and formatted as single-line strings within the array to comply with JSON standards.`
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

  saveGeneratedArticle = async (article: any, submissionId: number, plan: string) => {
  const { title, content } = article;
  const stringifiedContent = JSON.stringify(content);

  const queryString = 'INSERT INTO articles (submission_id, title, content, plan) VALUES ($1, $2, $3, $4) RETURNING article_id'
  const values = [submissionId, title, stringifiedContent, plan]

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
          Data: '🌟 Your Story is Now Published! Discover Your Article on [Platform/Website Name] 🌟'
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
              <a href="http://localhost:5173/${slug}">View Your Article</a>

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
          Html: {
            Data: `
            <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; }
                  h1 { color: #333366; }
                  p { color: #333333; }
                  .content-section { margin-top: 20px; }
                  .footer { margin-top: 30px; font-style: italic; }
                </style>
              </head>
              <body>
                <h1>Congratulations on Taking the First Step!</h1>

                <p>We are delighted to inform you that we have received your story submission. Our team of skilled journalists is brimming with excitement and ready to bring your unique narrative to life.</p>

                <div class="content-section">
                  <h2>Here's What Happens Next:</h2>
                  <p><strong>Stay Informed:</strong> We believe in keeping you closely involved in every step of the process. You can expect regular updates via email, keeping you informed of the progress we make with your article.</p>
                  <p><strong>Review and Approval:</strong> Crafting your story is a collaborative process. Once our team has intricately woven your narrative, you will have the opportunity to review it. This stage ensures that your voice and message shine through in every word.</p>
                  <p><strong>Ready for the World:</strong> With your approval, we will take the final steps to prepare your article for publishing. The moment your story is ready to be shared with the world, you will be the first to know!</p>
                </div>

                <div class="footer">
                  <p>We deeply appreciate your contribution to our storytelling journey. Your story is now in the caring and capable hands of our dedicated team. As we embark on this creative endeavor, we share in your anticipation and excitement.</p>
                  <p>Keep an eye on your inbox for the latest updates and for the grand reveal of your completed article. Should you have any questions in the meantime, please feel free to reach out.</p>
                </div>
              </body>
              </html> `
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
          Html: {
            Data: `
            <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; }
                h1 { color: #333366; }
                p { color: #333333; }
                .header-section { margin-bottom: 20px; }
                .content-section { margin-top: 20px; }
                .footer { margin-top: 30px; font-style: italic; }
              </style>
            </head>
            <body>
              <div class="header-section">
                <h1>We are thrilled to inform you that your article, titled "${title}", has officially entered the editorial process!</h1>
              </div>

              <div class="content-section">
                <h2>What Happens Next?</h2>
                <p>Our editorial team will meticulously review and polish your article, ensuring every word resonates with your intended message and audience. We're dedicated to preserving the authenticity of your narrative while enhancing its clarity and impact.</p>

                <h2>Stay Tuned for Updates</h2>
                <p>Throughout this process, we'll keep you in the loop with regular updates. You'll be the first to know when your article is ready for the next step.</p>
              </div>

              <div class="footer">
                <p>We're honored to be a part of your storytelling journey and can't wait to showcase your article. Thank you for trusting us with your experiences and ideas.</p>
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
          Html: {
            Data: `
            <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; }
                  h1 { color: #333366; }
                  p { color: #333333; }
                  .header-section { margin-bottom: 20px; }
                  .content-section { margin-top: 20px; }
                  .footer { margin-top: 30px; font-style: italic; }
                  a { color: #1a0dab; text-decoration: none; }
                </style>
              </head>
              <body>
                <div class="header-section">
                  <h1>We are excited to announce that your article, “[Article Title]”, is now beautifully crafted and ready for your review!</h1>
                </div>

                <div class="content-section">
                  <h2>Ready for the Spotlight</h2>
                  <p>Our editorial team has worked diligently to ensure that your story is told in the most compelling and authentic way possible. We believe that it's not just an article; it's a piece of art that reflects your unique journey and insights.</p>

                  <h2>Review and Submit for Publication</h2>
                  <p>It’s now your turn to take a look at the final piece. Please review the article at your earliest convenience to give it your stamp of approval.</p>
                  <a href="http://localhost:3000/preview/${slug}">Review Your Article</a>

                  <h2>Next Steps</h2>
                  <p>Once you review and approve the article, we will proceed with publishing it, showcasing your story to the world. We can’t wait to share it with our audience!</p>
                </div>

                <div class="footer">
                  <p>Questions or Feedback? If you have any questions or need assistance, our team is here to help. Feel free to reach out at any time.</p>
                  <p>Thank you for sharing your story with us and for being an integral part of this creative journey. We are thrilled to be a part of bringing your voice to a wider audience.</p>
                  <p>Warm regards,</p>
                  <p>The Journova Team</p>
                </div>
              </body>
              </html>

            ` // Email body
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
    console.log('INSIDE SAVE REVISED ARTICLE SERVICE, ARTICLE TO BE SAVED', article)
    try {
      await db.query(queryString, values);
    } catch (e) {
      console.error('error in saveRevisedArticle service', e);
    }
  };

  sendRevisionEmail = async (email: string, slug: string) => {
    const params = {
      Source: 'support@journova.org', // verified SES sender email
      Destination: {
        ToAddresses: [email] // The recipient's email address
      },
      Message: {
        Subject: {
          Data: "Your Revised Article is Ready for Review - Take a Look!"
        },
        Body: {
          Html: {
            Data: `
            <html>
              <head>
                <style>
                  /* Your existing styles */
                </style>
              </head>
              <body>
                <div class="header-section">
                  <h1>Your revised article, “[Article Title]”, is now ready for review!</h1>
                </div>

                <div class="content-section">
                  <h2>Refined for Perfection</h2>
                  <p>Following your valuable feedback, our team has fine-tuned your article. We've focused on making the revisions you've requested to ensure your story is shared just the way you envisioned it.</p>

                  <h2>Review the Changes</h2>
                  <p>Please take a moment to review the revised version of your article. Your final approval is crucial before we move forward with publishing.</p>
                  <a href="http://localhost:3000/revision/${slug}">Review Your Revised Article</a>

                  <h2>Approving Your Article</h2>
                  <p>Once you're satisfied with the revisions, let us know, and we'll prepare your article for its public debut. We're excited to showcase the updated version of your story!</p>
                </div>

                <div class="footer">
                  <p>Questions or additional feedback? Our team is always here to assist you. Feel free to reach out to us anytime.</p>
                  <p>Thank you for collaborating with us on this journey. Your story, in its best form, is just steps away from being shared with the world.</p>
                  <p>Best regards,</p>
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

  publish = async (articleId: number) => {
     const queryString = 'UPDATE articles SET published = $1 WHERE article_id = $2'
     const values = [true, articleId];

     try {
      await db.query(queryString, values);
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



}

export default  ArticleService;