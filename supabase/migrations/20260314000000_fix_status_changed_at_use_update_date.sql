-- Fix: use Iberdrola's update_date instead of NOW() for status_changed_at
--
-- Problem: The trigger was setting status_changed_at = NOW() (scraper time)
-- instead of the actual Iberdrola timestamp. This caused a ~5 min delay
-- in the "Occupied for" timer (scraper polling interval).
--
-- Evidence from production (cp_id 147988):
--   port2_update_date     = 06:50:08 (Iberdrola)
--   port2_status_changed_at = 06:54:19 (trigger NOW())
--   Gap: +4 min
--
-- Fix: COALESCE(NEW.portN_update_date, NOW()) for ALL cases

CREATE OR REPLACE FUNCTION public.maintain_port_status_changed_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.port1_status IS NOT NULL THEN
      NEW.port1_status_changed_at := COALESCE(NEW.port1_update_date, NOW());
    END IF;
    IF NEW.port2_status IS NOT NULL THEN
      NEW.port2_status_changed_at := COALESCE(NEW.port2_update_date, NOW());
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.port1_status IS DISTINCT FROM NEW.port1_status THEN
      NEW.port1_status_changed_at := COALESCE(NEW.port1_update_date, NOW());
    ELSIF NEW.port1_status = 'OCCUPIED'
      AND OLD.port1_update_date IS DISTINCT FROM NEW.port1_update_date THEN
      NEW.port1_status_changed_at := COALESCE(NEW.port1_update_date, NOW());
    END IF;

    IF OLD.port2_status IS DISTINCT FROM NEW.port2_status THEN
      NEW.port2_status_changed_at := COALESCE(NEW.port2_update_date, NOW());
    ELSIF NEW.port2_status = 'OCCUPIED'
      AND OLD.port2_update_date IS DISTINCT FROM NEW.port2_update_date THEN
      NEW.port2_status_changed_at := COALESCE(NEW.port2_update_date, NOW());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
