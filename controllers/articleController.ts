import express, { Request, Response, NextFunction} from 'express'
import ArticleService from '../services/articleService'
import Stripe from 'stripe';
import * as dotenv from 'dotenv';
import slugify from '../utils/slugify';
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
        const { submissionId } = req.body;

        const session = await this.stripe.checkout.sessions.create({
          line_items: [
            {
              price: 'price_1ONlqALGU8dofAUr4ughvLMC', // Your price ID
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `http://localhost:3000/article?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `http://localhost:3000/payment`,
          automatic_tax: { enabled: true },
          metadata: { submissionId },
        });

        res.json({ sessionId: session.id }); // Send session ID to the frontend
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
    const { article, submissionId } = res.locals;
    const parsedArticle = JSON.parse(article[0].message.content);

    try {
      const response = await this.articleService.saveGeneratedArticle(parsedArticle, submissionId);
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


}

export default ArticleController;