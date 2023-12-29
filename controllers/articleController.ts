import express, { Request, Response, NextFunction} from 'express'
import ArticleService from '../services/articleService'
import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import slugify from '../utils/slugify';
import fs from 'fs';
import schedule from 'node-schedule';
import agenda from '../agendaConfig';
import deslugify from '../utils/deslugify';
dotenv.config();

class ArticleController {

  private articleService: ArticleService;
  private stripe: Stripe;

  constructor () {
    this.articleService = new ArticleService();
    this.stripe = new Stripe(process.env.STRIPE_TEST_KEY as string);

  }

    saveSubmission = async (req: Request, res: Response, next: NextFunction) => {
      const { input } = req.body;

      try {
        const submissionId = await this.articleService.saveSubmission(input)

        res.locals.submissionId = submissionId;
        return next();
      } catch (e: any) {
        console.error('error saving submission', e);
        res.status(500).send('Server error');
      }
    }
    // saveSubmission = async (req: Request, res: Response, next: NextFunction) => {
    //   const input = req.body;
    //   const imageFile = req.file; // The uploaded image file

    //   if (imageFile === undefined) {
    //     return 'error image File undefined'
    //   }

    //   try {
    //     // Upload imageFile to S3 and get the URL
    //     const imageUrl = await this.articleService.uploadImageToS3(imageFile);
    //     input.imageUrl = imageUrl;
    //     // Save submission with image URL
    //     const submissionId = await this.articleService.saveSubmission(input);

    //     res.locals.submissionId = submissionId;
    //     return next();
    //   } catch (e) {
    //     console.error('error saving submission', e);
    //     res.status(500).send('Server error');
    //   }
    // };

    getSubmission = async (req: Request, res: Response, next: NextFunction) => {
      const { submissionId } = res.locals;

      try {
        const response = await this.articleService.getSubmission(submissionId);
        res.locals.inputs = response;
        return next();
      } catch (e: any) {
        console.error('error in getSubmission controller', e)
        return next(e)
      }
    }

    checkStatus = async (req: Request, res: Response, next: NextFunction) => {

      const submissionId = parseInt(req.params.submissionId as string, 10);
      try {
        const response = await this.articleService.checkStatus(submissionId);
        res.locals.status = response;
        console.log('ARTICLE SERVICE RESPONSE', response)
        return next();
      } catch (e) {
        console.error('error in check status controller', e)
      }
    }

    checkout = async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { submissionId, plan } = req.body;

        let product: string;

        if (plan === 'article') {
          product = 'price_1OQbB2LGU8dofAUrf2AiXjvL';
        } else if (plan === 'published') {
          product = 'price_1OQbBbLGU8dofAUrjWqU6LqW';
        } else if (plan === 'premium') {
          product = 'price_1OQbDJLGU8dofAUrQEDnLMRE';
        } else {
          return 'no product found';
        }

        const session = await this.stripe.checkout.sessions.create({
          line_items: [
            {
              price: product, // Your price ID
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${process.env.JOURNOVA_DOMAIN}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.JOURNOVA_DOMAIN}/payment`,
          automatic_tax: { enabled: true },
          metadata: { submissionId, plan },
        });

        res.json({ sessionId: session.id, plan: plan }); // Send session ID to the frontend
      } catch (error) {
        console.error('Error creating Stripe checkout session:', error);
        next(error);
      }
    };

    generateArticle = async (req: Request, res: Response, next: NextFunction ) => {
    const { inputs } = res.locals;
    try {
      const article = await this.articleService.generateArticle(inputs);
      res.locals.article = article;
      return next();
    } catch (e) {
      console.error('error in generateArticle middleware', e);
    }

  }

    saveGeneratedArticle = async (req: Request, res: Response, next: NextFunction ) => {
    const { article, submissionId, plan, inputs } = res.locals;
    let imageUrl = null;
    if (Array.isArray(inputs.headerImage) && inputs.headerImage.length > 0) {
        imageUrl = inputs.headerImage[0];
    }
    console.log('HERE INSIDE SAVEGENERATEDARTICLE, ARTICLE FROM RES LOCALCS', article);
    const parsedArticle = JSON.parse(article[0].message.content);

    try {
      const response = await this.articleService.saveGeneratedArticle(parsedArticle, submissionId, plan, imageUrl);
      res.locals.newArticleId = response;
      return next();
    } catch (e) {
      console.error('error trying to save article')
    }


  }

    getSavedArticle = async (req: Request, res: Response, next: NextFunction ) => {
      const { slug } = req.params;
      try {
        const response = await this.articleService.getSavedArticle(slug);
        res.locals.article = response;
        return next()
      } catch (e) {
        console.error('error trying to retrieve article', e)
      }
    }



    sendEmail = async (req: Request, res: Response, next: NextFunction) => {
      const { title, articleId } = req.body;
      const slug = slugify(title, articleId);

      try {
        const email = await this.articleService.getEmailByArticleId(articleId);

        await this.articleService.sendEmail(slug, email);
        res.status(200).send('article successfully sent');
      } catch (e) {
        console.error('error in sendEmail controller', e);
      }
    }

    scheduleEmails = async (req: Request, res: Response, next: NextFunction) => {
      const { inputs, article, newArticleId, plan } = res.locals;
      const { email, firstName } = inputs;

      const parsedArticle = JSON.parse(article[0].message.content);
      const { title } = parsedArticle
      const slug = slugify(title, newArticleId);

      try {
       //initial confirmation email
        await this.articleService.sendConfirmationEmail(email, firstName);

        // Schedule other emails based on plan
        if (plan === 'premium') {
          await agenda.schedule('in 60 seconds', 'send editorial email', { email, title });
          await agenda.schedule('in 2 minutes', 'send review email', { slug, email });
        } else {
          await agenda.schedule('in 30 seconds', 'send editorial email', { email, title });
          if (plan === 'article') {
            await agenda.schedule('in 60 seconds', 'send article email', { slug, email });
          } else {
            await agenda.schedule('in 60 seconds', 'send review email', { slug, email });
          }
        }
      } catch (e) {
        console.error('Error scheduling emails with Agenda:', e);
        next(e);
      }

      // try {
      //   // Send confirmation email immediately

      //   await this.articleService.sendConfirmationEmail(email);

      //   if (plan === 'premium') {
      //     //15 * 60 * 60 * 1000
      //     schedule.scheduleJob(Date.now() + 30000, async () => {
      //       await this.articleService.sendEditorialEmail(email, title);
      //     });

      //     //20 * 60 * 60 * 1000
      //     schedule.scheduleJob(Date.now() + 60000, async () => {
      //       await this.articleService.sendReviewEmail(slug, email);
      //     });
      //   } else {
      //       //44 * 60 * 60 * 1000
      //   schedule.scheduleJob(Date.now() + 30000, async () => {
      //     await this.articleService.sendEditorialEmail(email, title);
      //   });

      //   //67 * 60 * 60 * 1000
      //   schedule.scheduleJob(Date.now() + 60000, async () => {
      //     if (plan === 'article') {
      //       await this.articleService.sendArticleEmail(slug, email)
      //     } else {
      //       await this.articleService.sendReviewEmail(slug, email);
      //     }
      //   });
      //   }
      // } catch (e) {
      //   console.error('Error sending confirmation email or scheduling', e);
      //   next(e);
      //   // Consider handling the error more explicitly, maybe passing it to next() for centralized error handling
      // }
    }

    revise = async (req: Request, res: Response, next: NextFunction) => {
      const { article } = res.locals;
      const { input } = req.body;
      console.log('INSIDE REVISE CONTROLLER HERES article', article)

      try {
        const response = await this.articleService.generateRevision(article, input);
        res.locals.revisedArticle = response;
        next();
      } catch (e) {
        console.error('error in revise article controller', e)
      }

    }

    saveRevisedArticle = async (req: Request, res: Response, next: NextFunction) => {
      const { revisedArticle } = res.locals;
      const { slug } = req.params;
      const articleId = deslugify(slug);
      res.locals.articleId = articleId;
      const article = revisedArticle[0].message.content;

      try {
        await this.articleService.saveRevisedArticle(article, articleId);
        next();
      } catch (e) {
        console.error('error in saveRevisedArticle service', e);
      }
    }

    sendRevisionEmail = async (req: Request, res: Response, next: NextFunction) => {
       const { articleId } = res.locals;
       const { slug } = req.params;

      try {
        const email = await this.articleService.getEmailByArticleId(articleId);
        await this.articleService.sendRevisionEmail(email, slug);
        next();
      } catch (e) {
        console.error('error in sendRevisionEmail controller', e)
      }


    }

    getSavedRevisedArticle = async (req: Request, res: Response, next: NextFunction) => {
      const { slug } = req.params;
      const articleId = deslugify(slug);
      try {
        const response = await this.articleService.getSavedRevisedArticle(articleId);
        res.locals.article = response;
        next()
      } catch (e) {
        console.error('error inside getSavedRevisedArticle controller', e);
      }
    }

    publish = async (req: Request, res: Response, next: NextFunction) => {
      const { version, articleId } = req.body;

      try {
        if (version === 'original') {
          await this.articleService.publish(articleId)
          return next();
        } else if (version === 'revised') {
          await this.articleService.publishRevision(articleId);
          return next()
        } else {
          return 'no version found'
        }

      } catch (e) {
        console.error('error in publish middleware');
        return next()
      }
    }

    uploadImage = async (req: Request, res: Response, next: NextFunction) => {
      console.log('HERE INSIDE UPLOADIMAGE CONTROLLER');
      try {
        if (!req.file) {
          throw new Error('No file uploaded');
        }
        const file = req.file; // The uploaded file information.
        const fileName = file.originalname; // Get the original file name.
        const mimeType = file.mimetype;

        const fileContent = fs.readFileSync(file.path);

        const url = await this.articleService.uploadImage(fileContent, fileName, mimeType);

        fs.unlinkSync(file.path);

        res.status(200).json({ imageUrl: url });
      } catch (e) {
        console.error('error inside uploadImage controller', e);
        res.status(500).send('Error uploading image');
      }
    };

}

export default ArticleController;