import Agenda from 'agenda';
import ArticleService from './services/articleService';
import * as dotenv from 'dotenv';
dotenv.config();
const articleService = new ArticleService();


const agenda = new Agenda({ db: { address: process.env.MONGO_URI as string}});

agenda.define('send editorial email', async (job: any, done) => {
  const { email, title } = job.attrs.data;
  await articleService.sendEditorialEmail(email, title);
  done();
});

agenda.define('send review email', async (job: any, done) => {
  const { slug, email } = job.attrs.data;
  await articleService.sendReviewEmail(slug, email);
  done();
});

agenda.define('send article email', async (job: any, done) => {
  const { slug, email } = job.attrs.data;
  await articleService.sendArticleEmail(slug, email);
  done();
});

export default agenda
