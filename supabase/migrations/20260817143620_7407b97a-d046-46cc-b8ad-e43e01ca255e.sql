-- HARDEN-15 R1c · record the probe refusals (they roll back inside the raising
-- transaction) so the two states are countable in one query, and run the canary.
INSERT INTO public.write_refusal (cid, tool, refusal, caller_cid, detail) VALUES
 ('CID-100001','work_dispose','NOT_BOOTED',NULL,'R1a probe · un-booted service caller'),
 ('CID-100001','work_dispose','CROSS_TENANT_REFUSED','CID-100002','R1b probe · booted CID-100002 principal on a CID-100001 row'),
 ('CID-100001','work_raise','NOT_BOOTED',NULL,'R2a probe · un-booted boot assertion'),
 ('CID-100004','work_raise','NOT_BOOTED',NULL,'R2a probe · un-booted boot assertion');
SELECT public.client_access_canary();