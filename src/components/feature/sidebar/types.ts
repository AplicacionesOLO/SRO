export interface MenuItem {
  path: string;
  label: string;
  icon: string;
  permission?: string;
  /** Si se define, además del permiso el usuario debe tener uno de estos roles */
  roles?: string[];
  section?: string;
  mobilePrimary?: boolean;
  children?: MenuItem[];
}