import { supabase } from "@/integrations/supabase/client";

const CASEY_STATES = [
  { name: "new", label: "New", color: "#3B82F6", sort_order: 0 },
  { name: "reminder_sent", label: "Reminder Sent", color: "#F59E0B", sort_order: 1 },
  { name: "past_due", label: "Past Due", color: "#EF4444", sort_order: 2 },
  { name: "verification_requested", label: "Verification Requested", color: "#8B5CF6", sort_order: 3 },
  { name: "disputed", label: "Disputed", color: "#EC4899", sort_order: 4 },
  { name: "payment_plan", label: "Payment Plan", color: "#06B6D4", sort_order: 5 },
  { name: "credit_hold", label: "Credit Hold", color: "#F97316", sort_order: 6 },
  { name: "escalated", label: "Escalated", color: "#DC2626", sort_order: 7 },
  { name: "paid", label: "Paid", color: "#22C55E", sort_order: 8 },
  { name: "closed", label: "Closed", color: "#6B7280", sort_order: 9 },
];

const CASEY_TEMPLATES = [
  { template_type: "reminder", subject: "Payment Reminder: {{item.title}}", body: "Dear {{contact.name}},\n\nThis is a friendly reminder that invoice {{item.title}} for {{item.amount}} is due on {{item.due_date}}.\n\nPlease arrange payment at your earliest convenience.\n\nBest regards" },
  { template_type: "statement", subject: "Account Statement for {{account.name}}", body: "Dear {{contact.name}},\n\nPlease find attached your current account statement. Your outstanding balance is {{item.amount}}.\n\nIf you have any questions, please don't hesitate to reach out." },
  { template_type: "verification_request", subject: "Invoice Verification: {{item.title}}", body: "Dear {{contact.name}},\n\nWe'd like to verify the details of invoice {{item.title}}. Could you please confirm:\n\n1. Receipt of the invoice\n2. Accuracy of the amount: {{item.amount}}\n3. Expected payment date\n\nThank you for your prompt response." },
  { template_type: "pay_link", subject: "Easy Payment Link: {{item.title}}", body: "Dear {{contact.name}},\n\nPay invoice {{item.title}} easily using the secure link below:\n\n[Payment Link]\n\nAmount due: {{item.amount}}" },
  { template_type: "plan_offer", subject: "Payment Plan Option: {{item.title}}", body: "Dear {{contact.name}},\n\nWe understand circumstances can change. We'd like to offer a payment plan for invoice {{item.title}} ({{item.amount}}).\n\nPlease reply to discuss options that work for both of us." },
  { template_type: "dispute_acknowledgement", subject: "Dispute Acknowledged: {{item.title}}", body: "Dear {{contact.name}},\n\nWe've received and logged your dispute regarding invoice {{item.title}}. Our team will review and respond within 3 business days.\n\nReference: {{item.id}}" },
  { template_type: "credit_hold", subject: "Credit Hold Notice: {{account.name}}", body: "Dear {{contact.name}},\n\nDue to outstanding balance of {{item.amount}} on invoice {{item.title}}, a credit hold has been placed on account {{account.name}}.\n\nPlease contact us to resolve this matter." },
  { template_type: "stop_work", subject: "Service Suspension Notice: {{account.name}}", body: "Dear {{contact.name}},\n\nDue to continued non-payment of {{item.amount}}, services for {{account.name}} will be suspended effective immediately.\n\nTo restore services, please arrange payment of all outstanding invoices." },
  { template_type: "escalation_notice", subject: "Escalation: {{item.title}}", body: "Dear {{contact.name}},\n\nInvoice {{item.title}} for {{item.amount}} has been escalated for further action. Please contact us immediately to avoid additional measures.\n\nThis is a time-sensitive matter." },
];

export async function seedCaseyPack(workspaceId: string) {
  // Check if already seeded
  const { data: existing } = await supabase
    .from("vertical_packs")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("name", "Casey Revenue Realization")
    .maybeSingle();

  if (existing) return { alreadySeeded: true };

  // Create states
  const { data: statesData } = await supabase
    .from("item_states")
    .insert(CASEY_STATES.map(s => ({ ...s, workspace_id: workspaceId })))
    .select();

  // Create templates
  const { data: templatesData } = await supabase
    .from("templates")
    .insert(CASEY_TEMPLATES.map(t => ({ ...t, workspace_id: workspaceId, channel: "email", tone: "professional" })))
    .select();

  // Create default policy
  const { data: policy } = await supabase
    .from("policies")
    .insert({ workspace_id: workspaceId, name: "Standard Collection", description: "Default invoice collection policy with escalation path" })
    .select()
    .single();

  if (policy) {
    await supabase.from("policy_rules").insert([
      { policy_id: policy.id, rule_type: "auto_remind", rule_json: { days_before_due: 3 }, sort_order: 0 },
      { policy_id: policy.id, rule_type: "escalation_trigger", rule_json: { days_overdue: 30 }, sort_order: 1 },
      { policy_id: policy.id, rule_type: "credit_hold_trigger", rule_json: { days_overdue: 60 }, sort_order: 2 },
    ]);
  }

  // Create playbook
  const { data: playbook } = await supabase
    .from("playbooks")
    .insert({ workspace_id: workspaceId, item_type: "invoice", name: "Invoice Collection" })
    .select()
    .single();

  if (playbook && templatesData) {
    const templateMap = Object.fromEntries(templatesData.map(t => [t.template_type, t.id]));
    await supabase.from("playbook_steps").insert([
      { playbook_id: playbook.id, step_order: 0, trigger_state: "new", action_type: "send_message", channel: "email", template_id: templateMap["reminder"], delay_minutes: 0, requires_approval: false },
      { playbook_id: playbook.id, step_order: 1, trigger_state: "past_due", action_type: "send_message", channel: "email", template_id: templateMap["verification_request"], delay_minutes: 1440, requires_approval: false },
      { playbook_id: playbook.id, step_order: 2, trigger_state: "past_due", action_type: "send_message", channel: "email", template_id: templateMap["plan_offer"], delay_minutes: 4320, requires_approval: true },
      { playbook_id: playbook.id, step_order: 3, trigger_state: "escalated", action_type: "send_message", channel: "email", template_id: templateMap["escalation_notice"], delay_minutes: 0, requires_approval: true },
    ]);
  }

  // Create vertical pack config
  await supabase.from("vertical_packs").insert({
    workspace_id: workspaceId,
    name: "Casey Revenue Realization",
    config: {
      item_type: "invoice",
      item_label: "Invoice",
      field_labels: {
        amount: "Invoice Amount",
        due_date: "Due Date",
        title: "Invoice Number",
      },
      state_names: CASEY_STATES.map(s => s.name),
      template_types: CASEY_TEMPLATES.map(t => t.template_type),
    },
  });

  return { success: true };
}
