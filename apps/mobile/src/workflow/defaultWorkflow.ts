import type { WorkflowTemplate } from "../domain";

export const DEFAULT_WORKFLOW_TEMPLATE: WorkflowTemplate = {
  id: 1,
  name: "Default OG Fulfillment Workflow",
  executionMode: "local",
  stepOrder: [
    "step_start",
    "step_capture",
    "step_review_photos",
    "step_ocr_match",
    "step_preview_message"
  ],
  steps: [
    {
      id: "step_start",
      type: "start-job",
      title: "Start Fulfillment",
      description: "Create a new fulfillment run and confirm the workflow path.",
      required: true,
      optional: false,
      config: {}
    },
    {
      id: "step_capture",
      type: "capture-photos",
      title: "Capture Product And Label Photos",
      description: "Take at least one product photo and one label photo.",
      required: true,
      optional: false,
      config: {
        minProductPhotos: 1,
        requireLabelPhoto: true
      }
    },
    {
      id: "step_review_photos",
      type: "review-photos",
      title: "Review Photos",
      description: "Confirm the photo set is complete before matching.",
      required: true,
      optional: false,
      config: {}
    },
    {
      id: "step_ocr_match",
      type: "ocr-match",
      title: "Run OCR, Review, And Confirm Match",
      description: "Extract recipient data from the label, review candidates, and confirm the matched order.",
      required: true,
      optional: false,
      config: {}
    },
    {
      id: "step_preview_message",
      type: "message-customer",
      title: "Message Customer",
      description: "Review the generated customer message and send it through the selected channel.",
      required: true,
      optional: false,
      config: {}
    }
  ]
};
