import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** La raíz no tiene contenido propio: lleva al panel o a la entrada. */
export default async function Inicio() {
  const sesion = await auth();
  redirect(sesion?.user ? "/panel" : "/entrar");
}
