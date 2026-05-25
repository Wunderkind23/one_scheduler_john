# SMO Scheduler

Service Monitoring Officers shift scheduling system.

## Structure

```
one_schedular/
├── backend/          # FastAPI Python backend
│   ├── app/
│   │   ├── main.py
│   │   ├── auth.py
│   │   ├── database.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── helpers.py
│   │   ├── routes/
│   │   │   ├── generate.py
│   │   │   └── shiftmodels.py
│   │   └── services/
│   │       └── scheduler.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example  ← copy to .env and fill in
├── frontend/         # React + Vite + TypeScript frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Login.tsx
│   │   │   └── Signup.tsx
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   └── ShiftModelBuilder.tsx
│   │   └── services/
│   │       └── api.ts
│   └── ...
└── docker-compose.yml
```

## Features

- **Automated Scheduling**: Generate optimal monthly shift schedules based on custom team models and rotation patterns.
- **Team Isolation**: Strict data segregation ensures Team Leads and Officers only see and manage schedules, officers, and requests within their own team.
- **Leave Management & Auto-Updates**: Officers can request leave. When a Team Lead approves the leave, the system automatically tags the officer as `(Leave)` in the main schedule and syncs their individual shift assignments.
- **Shift Swapping with Validation**: Officers can swap shifts. The system strictly validates that both officers are actively scheduled on the requested dates. Upon Team Lead approval, the schedule and underlying assignments automatically swap the two officers.
- **Email Notifications**: Seamless integration with background tasks to dispatch monthly schedules directly to team members.

## Quick Start

### 1. Set up backend env
```bash
cp backend/.env.example backend/.env
# Edit backend/.env and set JWT_SECRET_KEY to a long random string
```

### 2. Run with Docker
```bash
docker-compose up --build
```

### 3. Run manually

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Default URLs
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
