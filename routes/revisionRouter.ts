import express, { Request, Response, Router } from 'express';
import * as dotenv from 'dotenv';
import ArticleController from '../controllers/articleController';
dotenv.config();
const articleController = new ArticleController();

const router: Router = express.Router();


router.post('/:slug', articleController.getSavedArticle, articleController.revise, articleController.saveRevisedArticle, articleController.sendRevisionEmail, (req: Request, res: Response) => {
  res.status(200).send('success')
});

router.get('/:slug', articleController.getSavedRevisedArticle, (req: Request, res: Response) => {
  const { article } = res.locals;
  res.status(200).json(article);
})

export default router;

