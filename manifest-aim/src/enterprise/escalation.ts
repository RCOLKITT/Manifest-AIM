/**
 * Escalation Routing for AIM
 *
 * Routes critical violations and timeouts to the appropriate contacts
 * via email, Slack, PagerDuty, or webhooks.
 */

import { randomUUID } from "node:crypto";
import type {
  EscalationPolicy,
  EscalationEvent,
  EscalationContact,
  EscalationTrigger,
  EscalationChannel,
  AuditEvent,
} from "./types.js";

export interface EscalationConfig {
  storage: EscalationStorage;
  channels: EscalationChannelHandlers;
  onEscalation?: (event: EscalationEvent) => void | Promise<void>;
}

/**
 * Storage interface for escalation events
 */
export interface EscalationStorage {
  saveEvent(event: EscalationEvent): Promise<void>;
  getEvent(id: string): Promise<EscalationEvent | null>;
  updateEvent(event: EscalationEvent): Promise<void>;
  listActiveEvents(): Promise<EscalationEvent[]>;
  listEventsByPolicy(policyId: string): Promise<EscalationEvent[]>;
}

/**
 * Channel handlers for sending escalation notifications
 */
export interface EscalationChannelHandlers {
  email?: EmailHandler;
  slack?: SlackHandler;
  pagerduty?: PagerDutyHandler;
  webhook?: WebhookHandler;
}

export interface EmailHandler {
  send(to: string, subject: string, body: string): Promise<void>;
}

export interface SlackHandler {
  sendToChannel(channel: string, message: SlackMessage): Promise<void>;
  sendToUser(userId: string, message: SlackMessage): Promise<void>;
}

export interface SlackMessage {
  text: string;
  blocks?: unknown[];
  attachments?: unknown[];
}

export interface PagerDutyHandler {
  trigger(serviceKey: string, incident: PagerDutyIncident): Promise<string>;
  acknowledge(incidentId: string): Promise<void>;
  resolve(incidentId: string): Promise<void>;
}

export interface PagerDutyIncident {
  summary: string;
  severity: "critical" | "error" | "warning" | "info";
  source: string;
  details?: Record<string, unknown>;
}

export interface WebhookHandler {
  send(
    url: string,
    payload: unknown,
    headers?: Record<string, string>,
  ): Promise<void>;
}

/**
 * In-memory escalation storage (for development/testing)
 */
export class InMemoryEscalationStorage implements EscalationStorage {
  private events: Map<string, EscalationEvent> = new Map();

  async saveEvent(event: EscalationEvent): Promise<void> {
    this.events.set(event.id, { ...event });
  }

  async getEvent(id: string): Promise<EscalationEvent | null> {
    const event = this.events.get(id);
    return event ? { ...event } : null;
  }

  async updateEvent(event: EscalationEvent): Promise<void> {
    this.events.set(event.id, { ...event });
  }

  async listActiveEvents(): Promise<EscalationEvent[]> {
    return Array.from(this.events.values()).filter(
      (e) => e.status === "active",
    );
  }

  async listEventsByPolicy(policyId: string): Promise<EscalationEvent[]> {
    return Array.from(this.events.values()).filter(
      (e) => e.policyId === policyId,
    );
  }
}

/**
 * Console-based channel handlers (for development/testing)
 */
export const consoleChannelHandlers: EscalationChannelHandlers = {
  email: {
    async send(to, subject, body) {
      console.log(`[EMAIL] To: ${to}, Subject: ${subject}\n${body}`);
    },
  },
  slack: {
    async sendToChannel(channel, message) {
      console.log(`[SLACK #${channel}] ${message.text}`);
    },
    async sendToUser(userId, message) {
      console.log(`[SLACK @${userId}] ${message.text}`);
    },
  },
  pagerduty: {
    async trigger(serviceKey, incident) {
      const incidentId = randomUUID();
      console.log(
        `[PAGERDUTY] Triggered incident ${incidentId}: ${incident.summary}`,
      );
      return incidentId;
    },
    async acknowledge(incidentId) {
      console.log(`[PAGERDUTY] Acknowledged incident ${incidentId}`);
    },
    async resolve(incidentId) {
      console.log(`[PAGERDUTY] Resolved incident ${incidentId}`);
    },
  },
  webhook: {
    async send(url, payload, headers) {
      console.log(`[WEBHOOK] POST ${url}`, JSON.stringify(payload, null, 2));
    },
  },
};

/**
 * Main escalation engine
 */
export class EscalationEngine {
  private policies: Map<string, EscalationPolicy> = new Map();
  private contacts: Map<string, EscalationContact> = new Map();
  private config: EscalationConfig;
  private checkInterval?: NodeJS.Timeout;

  constructor(config: EscalationConfig) {
    this.config = config;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Configuration
  // ──────────────────────────────────────────────────────────────────────────

  registerPolicy(policy: EscalationPolicy): void {
    this.policies.set(policy.id, policy);
  }

  registerContact(contact: EscalationContact): void {
    this.contacts.set(contact.id, contact);
  }

  getPolicy(policyId: string): EscalationPolicy | undefined {
    return this.policies.get(policyId);
  }

  getContact(contactId: string): EscalationContact | undefined {
    return this.contacts.get(contactId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Trigger Evaluation
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Check if a violation should trigger escalation
   */
  async evaluateViolation(
    violation: AuditEvent["violation"],
    context: Record<string, unknown> = {},
  ): Promise<void> {
    if (!violation) return;

    for (const policy of this.policies.values()) {
      for (const trigger of policy.triggers) {
        if (this.triggerMatches(trigger, violation, context)) {
          await this.createEscalation(policy, trigger, {
            type: trigger.type,
            details: context,
            violation,
          });
          break; // One escalation per policy
        }
      }
    }
  }

  private triggerMatches(
    trigger: EscalationTrigger,
    violation: NonNullable<AuditEvent["violation"]>,
    context: Record<string, unknown>,
  ): boolean {
    switch (trigger.type) {
      case "severity":
        return trigger.severity === violation.severity;

      case "repeated_violation":
        // Would need historical data to check
        // For now, just return false
        return false;

      case "approval_timeout":
        // Handled separately via approval workflow
        return false;

      case "custom":
        // Would need expression evaluator
        return false;

      default:
        return false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Escalation Management
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Create a new escalation event
   */
  async createEscalation(
    policy: EscalationPolicy,
    trigger: EscalationTrigger,
    triggerContext: EscalationEvent["triggerContext"],
  ): Promise<EscalationEvent> {
    const now = new Date();

    const event: EscalationEvent = {
      id: randomUUID(),
      policyId: policy.id,
      triggerId: `${trigger.type}:${trigger.severity ?? trigger.timeoutDuration ?? "default"}`,
      currentLevel: 0,
      status: "active",
      triggerContext,
      history: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.config.storage.saveEvent(event);

    // Send first level notification
    await this.escalateToLevel(event, policy, 0);

    if (this.config.onEscalation) {
      await this.config.onEscalation(event);
    }

    return event;
  }

  /**
   * Escalate to a specific level
   */
  private async escalateToLevel(
    event: EscalationEvent,
    policy: EscalationPolicy,
    level: number,
  ): Promise<void> {
    if (level >= policy.levels.length) {
      // No more levels to escalate to
      return;
    }

    const escalationLevel = policy.levels[level];
    const now = new Date();

    // Send notifications to all contacts at this level
    for (const contactId of escalationLevel.contacts) {
      const contact = this.contacts.get(contactId);
      if (!contact) continue;

      await this.sendNotification(contact, event, policy, escalationLevel);
    }

    // Record in history
    event.history.push({
      level,
      contacts: escalationLevel.contacts,
      sentAt: now,
    });

    event.currentLevel = level;
    event.updatedAt = now;

    await this.config.storage.updateEvent(event);
  }

  /**
   * Send notification to a contact
   */
  private async sendNotification(
    contact: EscalationContact,
    event: EscalationEvent,
    policy: EscalationPolicy,
    level: { message?: string },
  ): Promise<void> {
    const message = this.formatMessage(event, policy, level.message);

    switch (contact.channel) {
      case "email":
        if (this.config.channels.email && contact.config.email) {
          await this.config.channels.email.send(
            contact.config.email,
            `[AIM Alert] ${policy.name}`,
            message,
          );
        }
        break;

      case "slack":
        if (this.config.channels.slack) {
          if (contact.config.slackChannel) {
            await this.config.channels.slack.sendToChannel(
              contact.config.slackChannel,
              { text: message },
            );
          } else if (contact.config.slackUserId) {
            await this.config.channels.slack.sendToUser(
              contact.config.slackUserId,
              { text: message },
            );
          }
        }
        break;

      case "pagerduty":
        if (
          this.config.channels.pagerduty &&
          contact.config.pagerdutyServiceKey
        ) {
          await this.config.channels.pagerduty.trigger(
            contact.config.pagerdutyServiceKey,
            {
              summary: `${policy.name}: ${event.triggerContext.type}`,
              severity: (event.triggerContext.violation?.severity ??
                "warning") as "critical" | "error" | "warning" | "info",
              source: "AIM",
              details: event.triggerContext.details,
            },
          );
        }
        break;

      case "webhook":
        if (this.config.channels.webhook && contact.config.webhookUrl) {
          await this.config.channels.webhook.send(
            contact.config.webhookUrl,
            {
              event,
              policy: { id: policy.id, name: policy.name },
              message,
            },
            contact.config.webhookHeaders,
          );
        }
        break;
    }
  }

  private formatMessage(
    event: EscalationEvent,
    policy: EscalationPolicy,
    customMessage?: string,
  ): string {
    if (customMessage) {
      return customMessage
        .replace("{{policy_name}}", policy.name)
        .replace("{{trigger_type}}", event.triggerContext.type)
        .replace(
          "{{severity}}",
          event.triggerContext.violation?.severity ?? "unknown",
        )
        .replace(
          "{{rule_name}}",
          event.triggerContext.violation?.ruleName ?? "unknown",
        )
        .replace(
          "{{message}}",
          event.triggerContext.violation?.message ?? "No details",
        );
    }

    const violation = event.triggerContext.violation;
    if (violation) {
      return [
        `🚨 AIM Escalation: ${policy.name}`,
        "",
        `Rule: ${violation.ruleName}`,
        `Severity: ${violation.severity}`,
        `Message: ${violation.message}`,
        violation.filePath ? `File: ${violation.filePath}` : null,
        violation.line ? `Line: ${violation.line}` : null,
        "",
        `Event ID: ${event.id}`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    return `AIM Escalation: ${policy.name} - ${event.triggerContext.type}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Acknowledgment & Resolution
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Acknowledge an escalation event
   */
  async acknowledge(eventId: string, acknowledgedBy: string): Promise<void> {
    const event = await this.config.storage.getEvent(eventId);
    if (!event) {
      throw new Error(`Escalation event not found: ${eventId}`);
    }

    if (event.status !== "active") {
      throw new Error(`Event is already ${event.status}`);
    }

    event.status = "acknowledged";
    event.updatedAt = new Date();

    // Update latest history entry
    const latestHistory = event.history[event.history.length - 1];
    if (latestHistory) {
      latestHistory.acknowledgedAt = new Date();
      latestHistory.acknowledgedBy = acknowledgedBy;
    }

    await this.config.storage.updateEvent(event);

    // Auto-resolve if configured
    const policy = this.policies.get(event.policyId);
    if (policy?.settings.autoResolveOnAck) {
      await this.resolve(eventId);
    }
  }

  /**
   * Resolve an escalation event
   */
  async resolve(eventId: string): Promise<void> {
    const event = await this.config.storage.getEvent(eventId);
    if (!event) {
      throw new Error(`Escalation event not found: ${eventId}`);
    }

    if (event.status === "resolved") {
      return;
    }

    event.status = "resolved";
    event.updatedAt = new Date();
    event.resolvedAt = new Date();

    await this.config.storage.updateEvent(event);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Periodic Checks
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Start periodic escalation checks
   */
  startPeriodicCheck(intervalMs: number = 60000): void {
    this.checkInterval = setInterval(() => {
      this.checkEscalations().catch(console.error);
    }, intervalMs);
  }

  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  private async checkEscalations(): Promise<void> {
    const activeEvents = await this.config.storage.listActiveEvents();
    const now = new Date();

    for (const event of activeEvents) {
      const policy = this.policies.get(event.policyId);
      if (!policy) continue;

      const currentLevel = policy.levels[event.currentLevel];
      if (!currentLevel) continue;

      const lastNotification = event.history[event.history.length - 1];
      if (!lastNotification) continue;

      const escalateAfterMs = this.parseDuration(currentLevel.escalateAfter);
      const timeSinceLastNotification =
        now.getTime() - lastNotification.sentAt.getTime();

      // Check if we need to escalate to next level
      if (
        timeSinceLastNotification >= escalateAfterMs &&
        !lastNotification.acknowledgedAt
      ) {
        const nextLevel = event.currentLevel + 1;
        if (nextLevel < policy.levels.length) {
          await this.escalateToLevel(event, policy, nextLevel);
        } else if (policy.settings.repeatInterval) {
          // Repeat at max level
          const repeatMs = this.parseDuration(policy.settings.repeatInterval);
          const maxRepeats = policy.settings.maxRepeats ?? 3;
          const repeats = event.history.filter(
            (h) => h.level === event.currentLevel,
          ).length;

          if (repeats < maxRepeats && timeSinceLastNotification >= repeatMs) {
            await this.escalateToLevel(event, policy, event.currentLevel);
          }
        }
      }
    }
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(m|h|d)$/);
    if (!match) {
      throw new Error(`Invalid duration format: ${duration}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const ms = {
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * ms[unit as keyof typeof ms];
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Querying
  // ──────────────────────────────────────────────────────────────────────────

  async getActiveEvents(): Promise<EscalationEvent[]> {
    return this.config.storage.listActiveEvents();
  }

  async getEvent(eventId: string): Promise<EscalationEvent | null> {
    return this.config.storage.getEvent(eventId);
  }
}

/**
 * Create a default escalation engine with in-memory storage and console handlers
 */
export function createEscalationEngine(
  options?: Partial<EscalationConfig>,
): EscalationEngine {
  return new EscalationEngine({
    storage: new InMemoryEscalationStorage(),
    channels: consoleChannelHandlers,
    ...options,
  });
}
