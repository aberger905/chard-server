import express, { Request, Response, NextFunction} from 'express';
import Stripe from 'stripe';
import agenda from '../agendaConfig';
import * as dotenv from 'dotenv';
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

class WebhookController {


  async handleStripeEvent(req: Request, res: Response, next: NextFunction) {

    const sig: any = req.headers['stripe-signature'];

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_SECRET_KEY as string);

        if (event.type === 'checkout.session.completed') {
            const session: any = event.data.object as Stripe.Checkout.Session;
            const submissionId: string | number = session.metadata.submissionId || 2;
            const plan: string = session.metadata.plan

            res.locals.submissionId = submissionId;
            res.locals.plan = plan;
            await agenda.schedule('in 1 second', 'initiate article process', { submissionId, plan})
            return res.status(200).send('success');
        } else {
            console.log('Unexpected event type:', event.type);
            res.status(400).send('Unexpected event type');
        }
    } catch (error: any) {
        console.error('Webhook Error:', error.message);
        res.status(400).send(`Webhook Error: ${error.message}`);
    }
  }
}

export default WebhookController;