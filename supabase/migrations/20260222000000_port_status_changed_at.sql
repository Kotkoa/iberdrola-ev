-- Add columns to track when port status actually changed (not just API update time)
ALTER TABLE public.station_snapshots
  ADD COLUMN IF NOT EXISTS port1_status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS port2_status_changed_at TIMESTAMPTZ;

-- Trigger function: only update changed_at when status really changes
CREATE OR REPLACE FUNCTION public.maintain_port_status_changed_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.port1_status IS NOT NULL THEN
      NEW.port1_status_changed_at := NOW();
    END IF;
    IF NEW.port2_status IS NOT NULL THEN
      NEW.port2_status_changed_at := NOW();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.port1_status IS DISTINCT FROM NEW.port1_status THEN
      NEW.port1_status_changed_at := NOW();
    END IF;
    IF OLD.port2_status IS DISTINCT FROM NEW.port2_status THEN
      NEW.port2_status_changed_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_maintain_port_status_changed_at
  BEFORE INSERT OR UPDATE ON public.station_snapshots
  FOR EACH ROW EXECUTE FUNCTION maintain_port_status_changed_at();

-- Bootstrap existing rows with best available approximation
UPDATE public.station_snapshots
SET port1_status_changed_at = COALESCE(port1_update_date, observed_at),
    port2_status_changed_at = COALESCE(port2_update_date, observed_at)
WHERE port1_status_changed_at IS NULL;
