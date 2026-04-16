# Guía Viva

An intelligent real-time tour guide that uses your device's GPS to automatically narrate nearby points of interest and predict upcoming ones along your route.

## Features
- Real-time GPS tracking and transport mode detection (walking, running, vehicle)
- Nearby POI discovery using Google Places API
- AI-powered narration in Colombian Spanish using OpenAI GPT-4o
- Text-to-Speech via Web Speech API
- Firebase Auth and Firestore for saving history and favorites
- PWA ready

## Setup Instructions

### 1. Google Cloud Platform
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Enable the following APIs:
   - Places API (New)
   - Geocoding API
   - Directions API
   - Maps JavaScript API
4. Create API keys in "APIs & Services" > "Credentials".
   - Create one key for the frontend (restrict to HTTP referrers).
   - Create one key for the backend (restrict to IP addresses).

### 2. OpenAI
1. Go to the [OpenAI Platform](https://platform.openai.com/).
2. Create an account and add billing.
3. Generate an API key.

### 3. Firebase
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create a new project.
3. Enable **Authentication** and add the **Google** sign-in provider.
4. Enable **Firestore Database** and set up the security rules (use the provided `firestore.rules`).
5. Register a Web App to get your Firebase config.

### 4. Environment Variables
Create a `.env` file in the root directory and add the following variables:
```env
VITE_GOOGLE_MAPS_API_KEY=your_frontend_maps_key
GOOGLE_PLACES_API_KEY=your_backend_maps_key
GOOGLE_GEOCODING_API_KEY=your_backend_maps_key
GOOGLE_DIRECTIONS_API_KEY=your_backend_maps_key

OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o

VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 5. Running Locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server (runs both frontend and backend concurrently):
   ```bash
   npm run dev
   ```

### 6. Deployment
This app is ready to be deployed to Firebase Hosting or Vercel.
For Firebase Hosting:
1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Init: `firebase init` (select Hosting)
4. Build: `npm run build`
5. Deploy: `firebase deploy --only hosting`
