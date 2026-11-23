import { customerProfileRows } from "../../../src/auth/customerProfileRows";
import { ProfileView } from "../../../src/auth/ProfileView";

export default function CustomerAccount() {
  return <ProfileView rows={customerProfileRows} roleLabel="Customer" />;
}
