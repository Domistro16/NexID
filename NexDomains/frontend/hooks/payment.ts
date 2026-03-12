// services/payments.ts
import axios from 'axios'

export interface PaymentIntent {
  amount: number
  currency: string
  txRef: string
  ts: number
  hash: string
}

export async function fetchPaymentIntent(
  domain: string,
  duration: number,
  currency: string,
): Promise<PaymentIntent | undefined> {
  try {
    const resp = await axios.post<PaymentIntent>(
      'https://seal-app-zivs6.ondigitalocean.app/api/api/calculate-price',
      {
        domain,
        duration,
        currency,
        lifetime: false,
      },
    )
    return resp.data
  } catch (error) {
    console.error('Error fetching payment intent:', error)
  }
}
