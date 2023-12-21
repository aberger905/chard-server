import express, { Request, Response, Router } from 'express';
import WebhookController from '../controllers/webhookController';
import * as dotenv from 'dotenv';
import ArticleController from '../controllers/articleController';
dotenv.config();
const webhookController = new WebhookController();
const articleController = new ArticleController();

const router: Router = express.Router();


router.post('/confirm', express.raw({type: 'application/json'}), webhookController.handleStripeEvent, articleController.getSubmission, articleController.generateArticle, articleController.saveGeneratedArticle, articleController.scheduleEmails, (req: Request, res: Response) => {
  res.status(200).send('success')
});

export default router;

