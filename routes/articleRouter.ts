import express, { Request, Response, Router } from 'express';
const router: Router = express.Router();
import ArticleController from '../controllers/articleController';

const articleController = new ArticleController()

router.post('/generate', articleController.generateArticle , articleController.saveGeneratedArticle, (req: Request, res: Response) => {
  const { newArticleId } = res.locals;
  res.status(200).json({articleId: newArticleId});
})

router.post('/submission', articleController.saveSubmission, (req: Request, res: Response) => {
  const { submissionId } = res.locals;
  res.status(200).json({submissionId: submissionId});
})

router.post('/checkout', articleController.checkout, (req: Request, res: Response) => {
  res.sendStatus(200);
})

router.post('/email', articleController.sendEmail, (req: Request, res: Response) => {
  res.status(200).json('success');
})

router.post('/publish', articleController.publish, (req: Request, res: Response) => {
  res.status(200).json('success');
})

router.get('/:slug', articleController.getSavedArticle, (req: Request, res: Response) => {
  const { article } = res.locals;
  res.status(200).json(article);
})

router.get('/status/:submissionId', articleController.checkStatus, (req: Request, res: Response) => {
  const { status } = res.locals;
  res.status(200).json(status);
})



export default router;