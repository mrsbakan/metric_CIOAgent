import { SetMetadata } from "@nestjs/common";
import { IS_PUBLIC_KEY } from "../guards/jwt-auth.guard.js";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
