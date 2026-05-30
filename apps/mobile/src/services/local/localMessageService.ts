import type { FulfillmentId, MessageTemplate } from "../../domain";
import { renderMessageTemplate } from "../../messages/renderMessageTemplate";
import type { IntegrationAuthService, MessageService } from "../interfaces";
import { createLocalRecordId, nowIso } from "../../utils";

import type { LocalStorageService } from "./localStorageService";
import { logApiEvent } from "./apiLogger";
import { seededTemplates } from "./seedData";

export class LocalMessageService implements MessageService {
  constructor(
    private storageService: LocalStorageService,
    private integrationAuthService: IntegrationAuthService
  ) {}

  private async resolveTemplate(fulfillmentId: FulfillmentId): Promise<MessageTemplate> {
    const state = await this.storageService.getRunState(fulfillmentId);
    if (!state) {
      throw new Error("Fulfillment run not found.");
    }

    const workflow = await this.storageService.getWorkflowTemplate(state.run.workflowTemplateId);
    const selectedTemplateId = workflow?.steps.find(
      (step) =>
        (step.type === "message-customer" || step.type === "approve-send") &&
        typeof step.config.messageTemplateId === "number"
    )?.config.messageTemplateId;

    if (typeof selectedTemplateId === "number") {
      const selectedTemplate = await this.storageService.getMessageTemplate(selectedTemplateId);
      if (selectedTemplate) {
        return selectedTemplate;
      }
    }

    const storedTemplates = await this.storageService.listMessageTemplates();
    return storedTemplates[0] ?? seededTemplates[0];
  }

  async generateMessagePreview(fulfillmentId: FulfillmentId) {
    logApiEvent("message", "generateMessagePreview", "request", {
      fulfillmentId
    });
    const state = await this.storageService.getRunState(fulfillmentId);
    if (!state) {
      throw new Error("Fulfillment run not found.");
    }
    if (!state.run.matchedOrderId) {
      throw new Error("Confirm the order match before previewing the message.");
    }

    const orders = await this.storageService.listOrders();
    const order = orders.find((item) => item.id === state.run.matchedOrderId);
    if (!order) {
      throw new Error("Matched order was not found.");
    }

    const template = await this.resolveTemplate(fulfillmentId);
    const channel = order.availableChannels.includes("integration-message")
      ? "integration-message"
      : order.buyerEmail
        ? "email"
        : "manual";

    const rendered = renderMessageTemplate(template, order);
    const preview = {
      id: createLocalRecordId(),
      fulfillmentId,
      channel,
      status: channel === "manual" ? "blocked" : "pending",
      subject: rendered.subject,
      body: rendered.body,
      createdAt: nowIso()
    } as const;

    await this.storageService.saveRunState({
      ...state,
      run: {
        ...state.run,
        selectedChannel: preview.channel
      },
      previewMessage: preview
    });

    logApiEvent("message", "generateMessagePreview", "response", {
      fulfillmentId,
      orderId: order.id,
      channel: preview.channel,
      status: preview.status,
      subject: preview.subject
    });
    return preview;
  }

  private async markFulfilledOnPlatform(
    order: {
      id: number;
      externalOrderId: string;
      integrationKey: string;
      integrationConnectionId?: number;
    },
    fulfillmentId: FulfillmentId,
    sendPlatformNotification: boolean
  ): Promise<void> {
    if (!order.integrationConnectionId) return;

    const creds = await this.integrationAuthService.getCredentials(order.integrationConnectionId);
    if (!creds) return;

    if (order.integrationKey === "squarespace" && creds.apiKey) {
      const { fulfillSquarespaceOrder } = await import("./squarespaceClient");
      logApiEvent("message", "platformFulfill", "request", {
        fulfillmentId,
        orderId: order.id,
        platform: "squarespace",
        sendNotification: sendPlatformNotification
      });
      await fulfillSquarespaceOrder(creds.apiKey, order.externalOrderId, {
        sendNotification: sendPlatformNotification
      });
      logApiEvent("message", "platformFulfill", "response", {
        fulfillmentId,
        orderId: order.id,
        platform: "squarespace",
        success: true
      });
      return;
    }

    if (order.integrationKey === "ebay" && creds.clientId && creds.clientSecret) {
      const { getValidEbayAccessToken, markEbayOrderShipped } = await import("./ebayClient");
      const accessToken = await getValidEbayAccessToken(
        order.integrationConnectionId,
        creds.clientId,
        creds.clientSecret
      );
      logApiEvent("message", "platformFulfill", "request", {
        fulfillmentId,
        orderId: order.id,
        platform: "ebay"
      });
      await markEbayOrderShipped(accessToken, order.externalOrderId, []);
      logApiEvent("message", "platformFulfill", "response", {
        fulfillmentId,
        orderId: order.id,
        platform: "ebay",
        success: true
      });
      return;
    }

    if (
      order.integrationKey === "amazon" &&
      creds.clientId &&
      creds.clientSecret &&
      creds.refreshToken &&
      creds.awsAccessKeyId &&
      creds.awsSecretAccessKey
    ) {
      const { getValidAmazonAccessToken, confirmAmazonShipment } = await import("./amazonClient");
      const accessToken = await getValidAmazonAccessToken(
        order.integrationConnectionId,
        creds.clientId,
        creds.clientSecret,
        creds.refreshToken
      );
      const marketplace = creds.marketplace?.trim() || "US";
      logApiEvent("message", "platformFulfill", "request", {
        fulfillmentId,
        orderId: order.id,
        platform: "amazon",
        marketplace
      });
      await confirmAmazonShipment(
        accessToken,
        creds.awsAccessKeyId,
        creds.awsSecretAccessKey,
        marketplace,
        order.externalOrderId
      );
      logApiEvent("message", "platformFulfill", "response", {
        fulfillmentId,
        orderId: order.id,
        platform: "amazon",
        success: true
      });
    }
    // Etsy: no programmatic fulfill without tracking number — local-only complete
  }

  async approveAndSend(fulfillmentId: FulfillmentId, channel: "integration-message" | "email" | "manual") {
    logApiEvent("message", "approveAndSend", "request", { fulfillmentId, channel });

    const state = await this.storageService.getRunState(fulfillmentId);
    if (!state || !state.previewMessage) {
      throw new Error("Generate a preview before sending.");
    }

    const orders = await this.storageService.listOrders();
    const order = orders.find((item) => item.id === state.run.matchedOrderId);
    if (!order) {
      throw new Error("Matched order was not found.");
    }

    let status: "approved" | "sent" | "blocked" = "approved";

    if (channel === "email") {
      // Collect product photos to attach — label photo is internal, product photos go to customer
      const productPhotoUris = state.photos
        .filter((photo) => photo.label === "product")
        .map((photo) => photo.uri);

      const MailComposer = await import("expo-mail-composer");
      logApiEvent("message", "emailCompose", "request", {
        fulfillmentId,
        recipients: order.buyerEmail ? [order.buyerEmail] : [],
        subject: state.previewMessage.subject,
        attachmentCount: productPhotoUris.length
      });
      await MailComposer.composeAsync({
        recipients: order.buyerEmail ? [order.buyerEmail] : [],
        subject: state.previewMessage.subject,
        body: state.previewMessage.body,
        ...(productPhotoUris.length > 0 ? { attachments: productPhotoUris } : {})
      });
      status = "sent";

      // Mark order fulfilled on platform (no second notification — we already emailed)
      try {
        await this.markFulfilledOnPlatform(order, fulfillmentId, false);
      } catch (platformError) {
        logApiEvent("message", "platformFulfill", "error", {
          fulfillmentId,
          orderId: order.id,
          channel: "email",
          error: platformError instanceof Error ? platformError.message : String(platformError)
        });
        // Non-fatal: local complete still happens below
      }
    } else if (channel === "integration-message") {
      // Platform sends its own fulfillment notification to customer
      try {
        await this.markFulfilledOnPlatform(order, fulfillmentId, true);
      } catch (platformError) {
        logApiEvent("message", "platformFulfill", "error", {
          fulfillmentId,
          orderId: order.id,
          channel: "integration-message",
          error: platformError instanceof Error ? platformError.message : String(platformError)
        });
      }
      status = "sent";
    } else {
      status = "blocked";
    }

    const nextState = {
      ...state,
      run: {
        ...state.run,
        status: status === "sent" ? ("completed" as const) : state.run.status,
        selectedChannel: channel,
        updatedAt: nowIso()
      },
      previewMessage: {
        ...state.previewMessage,
        channel,
        status
      },
      approval: {
        fulfillmentId,
        approvedAt: nowIso(),
        approvedBy: "local-device-user"
      }
    };

    await this.storageService.saveRunState(nextState);
    logApiEvent("message", "approveAndSend", "response", {
      fulfillmentId,
      orderId: order.id,
      channel,
      status,
      runStatus: nextState.run.status
    });
    return nextState;
  }
}
