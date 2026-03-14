# AIM Studio

Visual Manifest Builder & Audit Dashboard for the Agent Instruction Manifest protocol.

## Features

- **Manifest Editor**: Visual YAML editor with syntax highlighting and validation
- **Rule Builder**: Drag-and-drop interface for creating governance rules
- **Audit Dashboard**: Real-time analytics and compliance metrics
- **Approval Queue**: Manage human-in-the-loop approval requests

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

Open [http://localhost:3000](http://localhost:3000) to view the studio.

## Architecture

```
studio/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # React components
│   │   ├── Sidebar.tsx
│   │   ├── ManifestEditor.tsx
│   │   ├── RuleBuilder.tsx
│   │   ├── AuditDashboard.tsx
│   │   └── ApprovalQueue.tsx
│   └── lib/              # Utilities and hooks
├── public/               # Static assets
└── package.json
```

## Integration

AIM Studio connects to the manifest-aim backend for:

- Manifest validation and compilation
- Audit event storage and retrieval
- Approval workflow management
- Team/RBAC configuration

## Environment Variables

```env
# API endpoint for manifest-aim backend
NEXT_PUBLIC_API_URL=http://localhost:4000

# Authentication (optional)
NEXT_PUBLIC_AUTH_PROVIDER=supabase
```

## Development

```bash
# Type checking
npm run typecheck

# Linting
npm run lint
```

## License

MIT
