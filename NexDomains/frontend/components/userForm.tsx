import React, { useState, useEffect } from 'react'
import { DomainMint } from './DomainMint'

type RegisterParams = {
  domain: string
  duration: number
  resolver: `0x${string}`
  data: `0x${string}`[]
  reverseRecord: boolean
  ownerControlledFuses: number
  lifetime: boolean
  referree: string
}
interface UserFormProps {
  address: string
  registerParams: RegisterParams
}

type FormData = {
  userEmail: string
  currency: string
  walletAddress: string
}

const currencies = [
  { country: 'Nigeria', currency: 'NGN' },
  { country: 'United States', currency: 'USD' },
  { country: 'Europe (SEPA)', currency: 'EUR' },
  { country: 'United Kingdom', currency: 'GBP' },
  { country: 'Ghana', currency: 'GHS' },
  { country: 'Francophone Africa (Central Africa)', currency: 'XAF' },
  { country: 'Francophone Africa (West Africa)', currency: 'XOF' },
  { country: 'South Africa', currency: 'ZAR' },
  { country: 'Malawi', currency: 'MWK' },
  { country: 'Kenya', currency: 'KES' },
  { country: 'Uganda', currency: 'UGX' },
  { country: 'Rwanda', currency: 'RWF' },
  { country: 'Tanzania', currency: 'TZS' },
]

export default function UserForm({ address, registerParams }: UserFormProps) {
  const [formData, setFormData] = useState<FormData>({
    userEmail: '',
    currency: 'NGN',
    walletAddress: address,
  })

  useEffect(() => {
    setFormData((prev) => ({ ...prev, walletAddress: address }))
  }, [address])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
  }

  return (
    <div className="fixed inset-0 h-full w-full bg-black/50 flex justify-center items-center z-50">
      <div className="max-w-xl md:max-w-3xl mx-auto my-8 p-6 bg-white shadow-lg rounded-2xl text-black">
        <h2 className="text-2xl font-semibold mb-4">User Details</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
          <div className="flex flex-col">
            <label htmlFor="userEmail" className="mb-1 font-medium">
              Email
            </label>
            <input
              id="userEmail"
              name="userEmail"
              type="email"
              value={formData.userEmail}
              onChange={handleChange}
              placeholder="mariagarcia@gmail.com"
              className="border rounded p-2 border-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="flex flex-col">
            <label htmlFor="currency" className="mb-1 font-medium">
              Currency
            </label>
            <select
              id="currency"
              name="currency"
              value={formData.currency}
              onChange={handleChange}
              className="border rounded p-2 border-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {currencies.map((c) => (
                <option key={c.country} value={c.currency}>
                  {c.country} ({c.currency})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end mt-4">
            <DomainMint
              registerparams={registerParams}
              userEmail={formData.userEmail}
              currency={formData.currency}
              walletAddress={address as `0x${string}`}
            />
          </div>
        </form>
      </div>
    </div>
  )
}
