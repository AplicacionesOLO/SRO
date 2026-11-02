export interface MenuItem {
  path: string;
  label: string;
  icon: string;
  permission?: string;
  section?: string;
  mobilePrimary?: boolean;
  children?: MenuItem[];
}