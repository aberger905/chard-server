import express, { Request, Response, Router } from 'express';
const router: Router = express.Router();
import NewsController from '../controllers/newsController';

const newsController = new NewsController();

router.get('/ping', (req: Request, res: Response) => {
  res.status(200).send('successful serve ping');
})

router.get('/', newsController.getArticles, newsController.saveArticles, (req: Request, res: Response) => {
  res.status(200).send('Articles successfully saved');
})

router.get('/latest', newsController.getSavedArticles, (req: Request, res: Response) => {
  const { articles } = res.locals;
  res.status(200).json(articles);
})


export default router;