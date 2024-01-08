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

    checkSubmission = async (req: Request, res: Response, next: NextFunction) => {
      const { submissionId } = res.locals;

      try {
          const isProcessed = await this.articleService.checkSubmission(submissionId);

          if (isProcessed) {
              return res.status(400).send('Submission already processed');
          } else {
              await this.articleService.updateProcessedSubmission(submissionId);
              next();
          }

      } catch (e) {
          console.error('error checking submission in checkSubmission controller', e);
          return next(e);
      }
  }

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
        await agenda.schedule('in 1 hour', 'send published email', { email, slug, title });
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

        if (plan === 'article') {
          await this.articleService.sendConfirmationEmail(email, firstName);

          await agenda.schedule('in 30 minutes', 'send editorial email', { email, firstName, title });
          await agenda.schedule('in 1 hour', 'send review email', { email, firstName, title, slug });

        } else if (plan === 'published') {
          await this.articleService.sendConfirmationEmail2(email, firstName);

          await agenda.schedule('in 8 hours', 'send editorial email 2', { email, firstName, title });
          await agenda.schedule('in 16 hours', 'send review email 2', { email, firstName, title, slug });

        } else if (plan === 'premium') {
          await this.articleService.sendConfirmationEmail3(email, firstName);

          await agenda.schedule('in 8 hours', 'send editorial email 2', { email, firstName, title });
          await agenda.schedule('in 16 hours', 'send review email 3', { email, firstName, title, slug });
        }

      } catch (e) {
        console.error('Error scheduling emails with Agenda:', e);
        next(e);
      }

    }

    revise = async (req: Request, res: Response, next: NextFunction) => {
      const { article } = res.locals;
      const { input } = req.body;

      if (article.revised !== null) {
        return res.status(400).send('article already revised');
      }

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
        await agenda.schedule('in 2 hours', 'send revision email', { email, slug });
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

    updateSitemap = async (req: Request, res: Response, next: NextFunction) => {
      const { title, articleId } = req.body;
      const slug = slugify(title, articleId);

      try {
        await this.articleService.updateSitemap(slug);
        next();
      } catch (e) {
        console.error('error inside update sitemap', e);
        next(e)
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