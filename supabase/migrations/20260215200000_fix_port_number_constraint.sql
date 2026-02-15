-- Fix port_number bug: drop broad UNIQUE(endpoint) constraint
-- The UNIQUE(endpoint) constraint forces one record per browser, preventing
-- reuse of inactive records for different station/port combinations.
-- The partial unique index subscriptions_unique_active already prevents
-- duplicate ACTIVE subscriptions per station/port/endpoint.

-- Drop the overly broad UNIQUE(endpoint) constraint
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_endpoint_unique;

-- Verify partial unique index still exists (safety check)
-- subscriptions_unique_active ON (station_id, port_number, endpoint) WHERE is_active=true
