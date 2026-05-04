import Conf from "conf";

interface ConfigSchema {
  authToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  serverUrl: string;
}

const config = new Conf<ConfigSchema>({
  projectName: "devnet",
  defaults: {
    authToken: "",
    refreshToken: "",
    userId: "",
    email: "",
    serverUrl: "wss://relay.devnet.sh",
  },
});

export default config;
