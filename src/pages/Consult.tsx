import { useEffect } from "react";
import { ConsultForm } from "./ConsultForm";

export default function Consult() {
  useEffect(() => {
    document.title = "RADDO · Consult";
  }, []);
  return <ConsultForm />;
}
