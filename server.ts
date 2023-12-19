import express , { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import newsRouter from './routes/newsRouter';
import articleRouter from './routes/articleRouter';
import webhookRouter from './routes/webhookRouter';
import * as dotenv from 'dotenv';
import connectDB from './db/db.config';
dotenv.config();
connectDB();



const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});


const app = express();
const port = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(limiter);
app.use(cookieParser());

app.use('/webhook', webhookRouter);
app.use(express.json());

app.use('/news', newsRouter);
app.use('/article', articleRouter);
app.use('*', (req: Request, res: Response) => res.status(400).send('not found'));

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const defaultErr = {
    log: "Express error handler caught unknown middleware error",
    status: 400,
    message: { err: "An error occurred" },
  };
  const errorObj = Object.assign({}, defaultErr, err);
  console.log(errorObj.log);
  return res.status(errorObj.status).json(errorObj.message);
});

app.listen(port, () => {
  console.log('Server listening on port', port);
});