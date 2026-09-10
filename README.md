# SwampDS Web Dashboard B-Nexus

A React-based web dashboard for monitoring the Swamp Drainage System (SwampDS). This application provides a user-friendly interface to track real-time sensor data, pump statuses, and historical analytics.

## ✨ Features

- **Secure Access**: Protected routes and authentication via Firebase.
- **Dashboard Overview**: High-level summary of system metrics.
- **Water Level Monitoring**: Real-time tracking of water levels.
- **Flow Sensors**: Data visualization for flow rates.
- **Pump Status**: Control and monitor the operational state of the drainage pumps.
- **Alerts System**: Notifications for threshold breaches or system anomalies.
- **Pumping History**: Historical data and analytics for past pumping operations.
- **Responsive UI**: Built with Tailwind CSS and Recharts for data visualization.

## 🛠️ Tech Stack

- **Frontend Core**: React 19, React Router v7, Vite
- **Styling**: Tailwind CSS v4, `clsx`, `tailwind-merge`
- **Icons**: Lucide React
- **Charts**: Recharts
- **Authentication/Backend**: Firebase
- **Linting**: Oxlint

## 📁 Project Structure

```text
swampds-web/
├── src/
│   ├── auth/           # Firebase authentication context and protected routes
│   ├── components/     # Reusable UI components and layouts
│   ├── data/           # Data fetching and state management
│   ├── firebase/       # Firebase initialization and config
│   ├── pages/          # Main application views (Dashboard, Sensors, etc.)
│   ├── App.jsx         # Application routing
│   └── main.jsx        # React entry point
├── package.json
└── vite.config.js
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or newer recommended)
- A Firebase project with Authentication and Firestore/Realtime DB enabled.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Abdurrahman-Sudais/swampds-web.git
   cd swampds-web
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## ⚙️ Configuration

Set up your Firebase configuration to connect the frontend to your backend. (Check `src/firebase/` for specific environment variable requirements, typically `VITE_FIREBASE_API_KEY`, etc.).

## ▶️ Usage

Start the development server:
```bash
npm run dev
```

Build for production:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## 👨🏽‍💻 Author

**Abdurrahman Sudais**

- GitHub: [https://github.com/Abdurrahman-Sudais](https://github.com/Abdurrahman-Sudais)
- Portfolio: [https://call-him-sudais.vercel.app](https://call-him-sudais.vercel.app)
