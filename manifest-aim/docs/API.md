# AIM API Reference

The AIM API server provides REST endpoints for AIM Studio and other clients.

## Starting the Server

```bash
manifest serve --port 4000
```

## Base URL

```
http://localhost:4000
```

## Authentication

Authentication is handled by your deployment. The API server expects authentication to be configured at the infrastructure level (e.g., API gateway, reverse proxy).

## Endpoints

### Health Check

```
GET /health
```

Returns server health status.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

### Manifests

#### List Manifests

```
GET /api/manifests
```

**Response:**

```json
{
  "manifests": [
    {
      "id": "manifest-1",
      "name": "my-project",
      "version": "1.0.0",
      "createdAt": "2024-01-10T08:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

#### Get Manifest

```
GET /api/manifests/:id
```

**Response:**

```json
{
  "manifest": {
    "id": "manifest-1",
    "name": "my-project",
    "version": "1.0.0",
    "content": "aim: '1.0'\nmetadata:\n  name: my-project\n..."
  }
}
```

#### Create Manifest

```
POST /api/manifests
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "my-project",
  "content": "aim: '1.0'\nmetadata:\n  name: my-project\n..."
}
```

**Response:**

```json
{
  "manifest": {
    "id": "manifest-new-id",
    "name": "my-project",
    "version": "1.0.0"
  }
}
```

#### Update Manifest

```
PUT /api/manifests/:id
Content-Type: application/json
```

**Request Body:**

```json
{
  "content": "aim: '1.0'\nmetadata:\n  name: my-project\n..."
}
```

**Response:**

```json
{
  "manifest": {
    "id": "manifest-1",
    "name": "my-project",
    "version": "1.0.1"
  }
}
```

#### Delete Manifest

```
DELETE /api/manifests/:id
```

**Response:**

```json
{
  "success": true
}
```

#### Validate Manifest

```
POST /api/manifests/:id/validate
```

**Response (valid):**

```json
{
  "valid": true
}
```

**Response (invalid):**

```json
{
  "valid": false,
  "errors": [
    "Missing required field: metadata.name",
    "Invalid severity: 'high' (must be critical|error|warning|info)"
  ]
}
```

---

### Enforcement

#### Run Enforcement

```
POST /api/enforce
Content-Type: application/json
```

**Request Body:**

```json
{
  "manifestId": "manifest-1",
  "content": "const apiKey = 'sk-secret123';",
  "filePath": "config.ts"
}
```

**Response:**

```json
{
  "result": {
    "passed": false,
    "violations": [
      {
        "ruleName": "no-hardcoded-secrets",
        "severity": "critical",
        "message": "Hardcoded API key detected",
        "filePath": "config.ts",
        "line": 1
      }
    ],
    "blocked": true,
    "transformed": false
  }
}
```

---

### Approvals

#### List Approvals

```
GET /api/approvals
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (pending, approved, rejected, expired) |
| `limit` | number | Max results (default: 50) |

**Response:**

```json
{
  "requests": [
    {
      "id": "req-123",
      "policyId": "policy-1",
      "status": "pending",
      "requesterId": "dev@company.com",
      "justification": "Critical hotfix",
      "decisions": [],
      "createdAt": "2024-01-15T08:00:00.000Z",
      "expiresAt": "2024-01-16T08:00:00.000Z"
    }
  ]
}
```

#### Get Approval

```
GET /api/approvals/:id
```

**Response:**

```json
{
  "request": {
    "id": "req-123",
    "policyId": "policy-1",
    "status": "pending",
    "context": {
      "ruleName": "production-deploy",
      "filePath": "deploy.sh",
      "details": {}
    },
    "requesterId": "dev@company.com",
    "justification": "Critical hotfix for payment processing",
    "decisions": [
      {
        "approverId": "lead@company.com",
        "decision": "approved",
        "comment": "Looks good",
        "timestamp": "2024-01-15T09:00:00.000Z"
      }
    ],
    "createdAt": "2024-01-15T08:00:00.000Z",
    "updatedAt": "2024-01-15T09:00:00.000Z",
    "expiresAt": "2024-01-16T08:00:00.000Z"
  }
}
```

#### Approve Request

```
POST /api/approvals/:id/approve
Content-Type: application/json
```

**Request Body:**

```json
{
  "approverId": "lead@company.com",
  "comment": "Approved for production deployment"
}
```

**Response:**

```json
{
  "request": {
    "id": "req-123",
    "status": "approved",
    "resolvedAt": "2024-01-15T10:00:00.000Z"
  }
}
```

#### Reject Request

```
POST /api/approvals/:id/reject
Content-Type: application/json
```

**Request Body:**

```json
{
  "approverId": "lead@company.com",
  "comment": "Missing test coverage, please add tests first"
}
```

**Response:**

```json
{
  "request": {
    "id": "req-123",
    "status": "rejected",
    "resolvedAt": "2024-01-15T10:00:00.000Z"
  }
}
```

---

### Audit

#### List Audit Events

```
GET /api/audit
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by event type |
| `severity` | string | Filter by severity |
| `startTime` | ISO date | Events after this time |
| `endTime` | ISO date | Events before this time |
| `limit` | number | Max results (default: 50) |

**Response:**

```json
{
  "events": [
    {
      "id": "evt-123",
      "type": "enforcement.violation",
      "timestamp": "2024-01-15T10:30:00.000Z",
      "actor": {
        "type": "user",
        "id": "dev@company.com"
      },
      "violation": {
        "ruleName": "no-hardcoded-secrets",
        "severity": "critical",
        "message": "Hardcoded API key detected",
        "filePath": "config.ts",
        "line": 42
      },
      "outcome": "failure"
    }
  ]
}
```

#### Get Audit Summary

```
GET /api/audit/summary
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `startTime` | ISO date | Summary period start |
| `endTime` | ISO date | Summary period end |

**Response:**

```json
{
  "summary": {
    "period": {
      "start": "2024-01-01T00:00:00.000Z",
      "end": "2024-01-31T23:59:59.000Z"
    },
    "totals": {
      "events": 1250,
      "violations": 89,
      "blocked": 23,
      "approvals": 45,
      "transforms": 12
    },
    "bySeverity": {
      "critical": 5,
      "error": 28,
      "warning": 41,
      "info": 15
    },
    "byRule": [
      { "ruleName": "no-hardcoded-secrets", "count": 12, "severity": "critical" },
      { "ruleName": "strict-typescript", "count": 35, "severity": "error" }
    ],
    "byFile": [
      { "filePath": "src/config.ts", "violationCount": 8 },
      { "filePath": "src/api/handler.ts", "violationCount": 6 }
    ],
    "trends": {
      "direction": "improving",
      "changePercent": -15
    }
  }
}
```

---

### Escalations

#### List Escalations

```
GET /api/escalations
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (active, acknowledged, resolved) |
| `policyId` | string | Filter by policy |

**Response:**

```json
{
  "escalations": [
    {
      "id": "esc-123",
      "policyId": "critical-violations",
      "status": "active",
      "currentLevel": 1,
      "triggerContext": {
        "type": "violation",
        "violation": {
          "ruleName": "no-hardcoded-secrets",
          "severity": "critical"
        }
      },
      "history": [
        {
          "level": 0,
          "contacts": ["oncall@company.com"],
          "sentAt": "2024-01-15T10:00:00.000Z"
        },
        {
          "level": 1,
          "contacts": ["manager@company.com"],
          "sentAt": "2024-01-15T10:05:00.000Z"
        }
      ],
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  ]
}
```

---

### Teams

#### List Teams

```
GET /api/teams
```

**Response:**

```json
{
  "teams": [
    {
      "id": "team-1",
      "name": "Platform Engineering",
      "members": [
        { "userId": "user-1", "role": "admin" },
        { "userId": "user-2", "role": "developer" }
      ]
    }
  ]
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message describing what went wrong"
}
```

**HTTP Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request (invalid input) |
| 404 | Resource not found |
| 500 | Internal server error |

## CORS

The API server includes CORS headers for cross-origin requests from AIM Studio.
