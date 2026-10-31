CREATE TABLE "customer_credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_credit_notes_tenant_id_number_unique" UNIQUE("tenant_id","number")
);
--> statement-breakpoint
CREATE TABLE "customer_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"placement_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	CONSTRAINT "customer_invoice_lines_placement_id_unique" UNIQUE("placement_id")
);
--> statement-breakpoint
CREATE TABLE "customer_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"subtotal" numeric(18, 4) NOT NULL,
	"tax_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(18, 4) NOT NULL,
	"total" numeric(18, 4) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_invoices_tenant_id_number_unique" UNIQUE("tenant_id","number")
);
--> statement-breakpoint
CREATE TABLE "customer_payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(18, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"date" date NOT NULL,
	"method" text,
	"reference" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_payments_tenant_id_number_unique" UNIQUE("tenant_id","number"),
	CONSTRAINT "customer_payments_tenant_id_idempotency_key_unique" UNIQUE("tenant_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "supplier_bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	CONSTRAINT "supplier_bill_lines_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "supplier_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"supplier_reference" text NOT NULL,
	"bill_date" date NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"tax" numeric(18, 4) DEFAULT '0' NOT NULL,
	"total" numeric(18, 4) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"date" date NOT NULL,
	"reference" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_payments_tenant_id_idempotency_key_unique" UNIQUE("tenant_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "customer_credit_notes" ADD CONSTRAINT "customer_credit_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit_notes" ADD CONSTRAINT "customer_credit_notes_invoice_id_customer_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."customer_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit_notes" ADD CONSTRAINT "customer_credit_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_invoice_id_customer_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."customer_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_allocations" ADD CONSTRAINT "customer_payment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_allocations" ADD CONSTRAINT "customer_payment_allocations_payment_id_customer_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."customer_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_allocations" ADD CONSTRAINT "customer_payment_allocations_invoice_id_customer_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."customer_invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_bill_id_supplier_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."supplier_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bill_lines" ADD CONSTRAINT "supplier_bill_lines_booking_id_supplier_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."supplier_bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_bill_id_supplier_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."supplier_bills"("id") ON DELETE no action ON UPDATE no action;