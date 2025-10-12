import { z } from 'zod';

export const phoneRE = /^[0-9+()\-.\s]{7,20}$/;

export const quoteSchema = z.object({
  // visible fields (rename if yours differ)
  name: z.string().min(2, 'Please enter your full name'),
  email: z.string().email('Enter a valid email'),
  phone: z.string().regex(phoneRE, 'Enter a valid phone'),
  address: z.string().min(5, 'Address required'),
  year: z.string().optional(),
  make: z.string().min(2, 'Select a make'),
  model: z.string().min(1, 'Select a model'),
  engine: z.string().optional(),
  trim: z.string().optional(),
  preferred_date: z.string(),
  preferred_time: z.string(),
  price: z.string().optional(),

  // anti-spam (invisible to user)
  company: z.string().max(0, 'Spam detected').optional(), // honeypot must be empty
  ts: z.string(), // timestamp when form rendered
});

export type QuotePayload = z.infer<typeof quoteSchema>;
