import { startApp } from "./bootstrapApp";
import { installRendererLifecycleDiagnostics } from "./services/rendererDiagnostics";

installRendererLifecycleDiagnostics();
void startApp();
