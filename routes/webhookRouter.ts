import express, { Request, Response, Router, NextFunction } from 'express';
import WebhookController from '../controllers/webhookController';
import * as dotenv from 'dotenv';
import ArticleController from '../controllers/articleController';
dotenv.config();
const webhookController = new WebhookController();
const articleController = new ArticleController();

const router: Router = express.Router();


router.post('/confirm', express.raw({type: 'application/json'}), webhookController.handleStripeEvent);

router.get('/initiate', (req: Request, res: Response, next: NextFunction) => {
  console.log('INSIDE INITIATE');
  res.locals.submissionId = req.query.submissionId;
  res.locals.plan = req.query.plan;
  next();
}, articleController.checkSubmission, articleController.getSubmission, articleController.generateArticle, articleController.saveGeneratedArticle, articleController.scheduleEmails, (req: Request, res: Response) => {
  res.status(200).send('success')
});

export default router;

