-- Detect car swaps: update status_changed_at when port_update_date changes
-- while status remains OCCUPIED (indicates new charging session)
CREATE OR REPLACE FUNCTION public.maintain_port_status_changed_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
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
    ELSIF NEW.port1_status = 'OCCUPIED'
      AND OLD.port1_update_date IS DISTINCT FROM NEW.port1_update_date THEN
      NEW.port1_status_changed_at := COALESCE(NEW.port1_update_date, NOW());
    END IF;

    IF OLD.port2_status IS DISTINCT FROM NEW.port2_status THEN
      NEW.port2_status_changed_at := NOW();
    ELSIF NEW.port2_status = 'OCCUPIED'
      AND OLD.port2_update_date IS DISTINCT FROM NEW.port2_update_date THEN
      NEW.port2_status_changed_at := COALESCE(NEW.port2_update_date, NOW());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
