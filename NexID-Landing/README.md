# NexID Landing

The marketing and information landing page for the **NexID** protocol. This is a React single-page application built with Vite and Tailwind CSS, serving as the public-facing entry point for the NexID ecosystem.

## What It Does

- Introduces the NexID identity protocol to new visitors
- Showcases live learn-to-earn campaigns powered by NexAcademy
- Links users to the Academy app, Domain registrar, and Partner Portal
- Highlights the "Proof of Knowledge" flow: learn → verify on-chain → earn rewards

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| React | 18.x | UI framework |
| Vite | 5.x | Build tool / dev server |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 3.x | Utility CSS styling |
| shadcn/ui | latest | Accessible component library |
| Radix UI | various | Headless UI primitives |
| Framer Motion | 12.x | Animations |
| React Router DOM | 6.x | Client-side routing |
| TanStack Query | 5.x | Data fetching / caching |
| Recharts | 2.x | Data visualization |
| React Hook Form | 7.x | Form management |
| Zod | 3.x | Schema validation |

## Project Structure

```
NexID-Landing/
├── src/                  # Application source code
├── public/               # Static assets (icons, images)
├── index.html            # HTML entry point
├── vite.config.ts        # Vite configuration
├── tailwind.config.ts    # Tailwind CSS theme configuration
├── tsconfig.json         # TypeScript configuration
├── eslint.config.js      # ESLint rules
├── postcss.config.js     # PostCSS configuration
├── components.json       # shadcn/ui registry config
└── package.json          # Dependencies and scripts
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm (or bun)

### Install & Run

```bash
# Install dependencies
npm install

# Start development server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Lint code
npm run lint
```

## Deployment

The production build outputs to `dist/`. This can be deployed to any static file host:

- **Vercel** (recommended): connect GitHub repository → auto-deploy on push
- **Netlify**: drag & drop `dist/` folder
- **Cloudflare Pages**: connect GitHub and set build command to `npm run build`
- **AWS S3 + CloudFront**: upload `dist/` and configure SPA routing

Since the app uses React Router with client-side routing, make sure your host is configured to redirect all routes to `index.html`.

## Related Packages

| Package | Description |
|---|---|
| [`NexAcademy/`](../NexAcademy/) | Campaign smart contracts + web app |
| [`NexDomains/`](../NexDomains/) | Domain registration system |
