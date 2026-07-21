# ✈️ Agentic AI Flight Engine

A production-ready, AI-powered flight search and monitoring platform built with **FastAPI**, **LangGraph**, and **React Native (Expo)**. Multi-provider flight search, streaming AI recommendations, real-time price alerts with push notifications, and one-command deployment to Azure, AWS, or Vercel.

---

## 🏗️ Repository Structure

```
agentic-flight-engine/
├── backend/                          # FastAPI + LangGraph backend
│   ├── app/
│   │   ├── main.py                   # App entry point, middleware, routers
│   │   ├── core/
│   │   │   ├── config.py             # Pydantic settings (env vars)
│   │   │   ├── database.py           # SQLAlchemy async engine
│   │   │   ├── dependencies.py       # FastAPI DI: DB, Redis, JWT auth
│   │   │   └── logging.py            # Structured logging setup
│   │   ├── agents/
│   │   │   ├── graph.py              # LangGraph agent graph (5-node pipeline)
│   │   │   └── tools.py              # Amadeus, Duffel, SerpAPI search tools
│   │   ├── api/routes/
│   │   │   ├── flights.py            # Search, streaming results, price alerts
│   │   │   ├── agents.py             # Chat endpoint + SSE streaming
│   │   │   ├── notifications.py      # Device registration, test push
│   │   │   └── health.py             # Health check
│   │   ├── models/
│   │   │   └── flight.py             # SQLAlchemy ORM: FlightSearch, PriceAlert, AgentRun
│   │   └── services/
│   │       ├── flight_service.py     # Search orchestration, alert CRUD
│   │       └── notification_service.py  # Expo / FCM / APNs push + PriceAlertMonitor
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
├── mobile/                           # React Native (Expo) app
│   ├── App.tsx                       # Root component
│   ├── app.json                      # Expo config + push notification plugin
│   ├── package.json
│   └── src/
│       ├── screens/
│       │   ├── SearchScreen.tsx      # Form + natural language search
│       │   ├── ResultsScreen.tsx     # Ranked itineraries + AI recommendation
│       │   ├── AgentChatScreen.tsx   # Streaming AI chat interface
│       │   └── AlertsScreen.tsx      # Price alert management
│       ├── services/
│       │   ├── api.ts                # Axios client, all API helpers, SSE stream
│       │   └── notifications.ts      # Expo push registration + listeners
│       ├── store/
│       │   └── flightStore.ts        # Zustand global store (persisted)
│       └── navigation/
│           └── AppNavigator.tsx      # Bottom tabs + stack navigator
│
├── infra/
│   ├── azure/
│   │   ├── main.bicep                # Container Apps, ACR, Redis, Service Bus
│   │   └── azure-pipelines.yml       # Azure DevOps CI/CD pipeline
│   ├── aws/terraform/
│   │   └── main.tf                   # VPC, ECS Fargate, RDS, ElastiCache, SQS, ALB
│   └── vercel/
│       └── vercel.json               # Vercel routing + env variable mapping
│
├── .github/workflows/
│   └── ci-cd.yml                     # GitHub Actions: test → build → deploy → EAS
│
├── docker-compose.yml                # Full local stack: API, Worker, Beat, PG, Redis
├── DEPLOYMENT.md                     # Step-by-step deployment guide (all platforms)
└── README.md
```

---

## 🤖 Agent Graph Architecture

The core AI pipeline uses **LangGraph** with a 5-node directed graph:

```
User Query
    │
    ▼
[intent_parser]     ← GPT-4o extracts structured search intent
    │
    ▼
[flight_search]     ← Parallel fetch: Amadeus + Duffel + SerpAPI
    │
    ├── (no results) → [respond] → Reply
    │
    ▼
[price_compare]     ← Scores itineraries: price × stops × duration × deal bonus
    │
    ▼
[recommendation]    ← GPT-4o selects best option with rationale
    │
    ▼
[respond]           ← Conversational response with booking/alert CTA
```

---

## 🚀 Quick Start

### 1. Clone
```bash
git clone https://github.com/your-org/agentic-flight-engine.git
cd agentic-flight-engine
```

### 2. Configure environment
```bash
cp backend/.env.example backend/.env
# Edit backend/.env — add your OPENAI_API_KEY, AMADEUS_*, DUFFEL_*, etc.
```

### 3. Start with Docker Compose
```bash
docker compose --profile dev up -d
```

| Service | URL |
|---------|-----|
| FastAPI | http://localhost:8000 |
| Swagger Docs | http://localhost:8000/docs |
| Adminer | http://localhost:8080 |

### 4. Run DB migrations
```bash
cd backend && alembic upgrade head
```

### 5. Start mobile app
```bash
cd mobile && npm install && npx expo start
```

---

## 📡 Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/flights/search` | Kick off agentic flight search |
| `GET` | `/api/v1/flights/search/{run_id}/stream` | SSE stream of agent progress |
| `GET` | `/api/v1/flights/search/{run_id}/result` | Poll for completed results |
| `POST` | `/api/v1/flights/alerts` | Create price drop alert |
| `GET` | `/api/v1/flights/alerts` | List user's active alerts |
| `DELETE` | `/api/v1/flights/alerts/{id}` | Remove an alert |
| `POST` | `/api/v1/agents/chat` | Single-turn AI chat |
| `POST` | `/api/v1/agents/chat/stream` | Streaming SSE AI chat |
| `POST` | `/api/v1/notifications/register` | Register device push token |

---

## 🔌 Flight Data Providers

| Provider | Coverage | Notes |
|----------|----------|-------|
| **Amadeus** | Global GDS | Best for structured fare data; test environment available |
| **Duffel** | 300+ airlines | Modern API, instant booking capability |
| **SerpAPI (Google Flights)** | Global | Price validation & fallback; no booking |

---

## 📱 Push Notifications

| Platform | Method | Setup Required |
|----------|--------|----------------|
| Expo (iOS + Android) | Expo Push API | `EXPO_ACCESS_TOKEN` |
| Android (native) | Firebase FCM | `FCM_SERVER_KEY` + `google-services.json` |
| iOS (native) | APNs HTTP/2 | `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_FILE` |

Price alert monitoring runs as a **Celery beat** task every 15 minutes, checking Amadeus for price drops and firing push notifications when the target price is met.

---

## ☁️ Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for full step-by-step guides.

| Platform | Infrastructure | CI/CD |
|----------|---------------|-------|
| **Azure** | Container Apps + ACR + Redis + Service Bus (Bicep) | Azure DevOps Pipelines |
| **AWS** | ECS Fargate + RDS + ElastiCache + SQS (Terraform) | GitHub Actions |
| **Vercel** | Serverless Python functions | GitHub Actions / Vercel Git |
| **Mobile** | Expo EAS Build + Submit | GitHub Actions |

---

## 🔐 Authentication

The backend uses **JWT Bearer tokens** with a pluggable verification stub in `app/core/dependencies.py`. Wire in your preferred auth provider (Auth0, Clerk, Supabase Auth, or a custom JWT issuer) by replacing the `verify_token` function.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend framework | FastAPI 0.111 |
| AI agent graph | LangGraph 0.2 |
| LLM | GPT-4o (OpenAI) |
| ORM | SQLAlchemy 2 (async) |
| Database | PostgreSQL 16 |
| Cache / broker | Redis 7 |
| Background jobs | Celery + APScheduler |
| Mobile | React Native + Expo 51 |
| State management | Zustand |
| Navigation | React Navigation v6 |
| Push notifications | Expo Notifications + FCM |
| IaC (Azure) | Bicep |
| IaC (AWS) | Terraform |
| CI/CD | GitHub Actions + Azure DevOps |

---

## 📄 License

MIT — see `LICENSE` for details.
