import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { JwtDatabaseGuard } from '../../core/auth/guards/jwt-db.guard';
import { RolesGuard } from '../../core/auth/guards/roles.guard';
import { CurrentUser } from '../../core/auth/decorators/current-user.decorator';
import { SpaceMenusService } from './space-menus.service';
import { SaveSpaceMenuConfigurationDto } from './dto/save-space-menu-configuration.dto';
import { RequirePermissions } from '../../core/auth/decorators/permissions.decorator';

@ApiTags('Space Menus')
@ApiBearerAuth('supabase-jwt')
@Controller('space-menu')
@UseGuards(JwtDatabaseGuard, RolesGuard)
export class SpaceMenusController {
  constructor(private readonly spaceMenusService: SpaceMenusService) {}

  @Get('shop/:shopId')
  @ApiOperation({ 
    summary: 'Get all menu items assigned to a shop (SpaceElement)',
    description: 'Retourne tous les produits (MenuItems) assignés à un shop avec leurs ingrédients, composants et packaging. Inclut la structure complète imbriquée : components → ingredients, ingredients directs, et packagings.'
  })
  @ApiParam({ name: 'shopId', description: 'ID du shop (SpaceElement)' })
  @ApiQuery({ name: 'configId', required: false, description: 'Configuration à lire (défaut : config v1 du parent, sinon première adhésion v2)' })
  @ApiResponse({ 
    status: 200, 
    description: 'Liste des produits du shop avec détails complets (prix, coûts, marges, ingrédients, composants, packaging)',
    schema: {
      type: 'object',
      properties: {
        shopId: { type: 'string', example: 'clx1a2b3c4d5e6f7g8h9i0j1k' },
        shopName: { type: 'string', example: 'Bar Principal' },
        shopType: { type: 'string', example: 'fnb_bar', description: 'Type enum du shop' },
        shopSubTypes: { type: 'array', items: { type: 'string' }, example: ['cafe'], description: 'Sous-types du shop' },
        notes: { type: 'string', nullable: true, description: 'Notes/description du shop' },
        image: { type: 'string', nullable: true, description: 'Image du shop' },
        attributes: { type: 'object', nullable: true, description: 'Attributs additionnels (JSON flexible)' },
        menuItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'menuitem-burger-classic' },
              name: { type: 'string', example: 'Burger Classic' },
              basePrice: { type: 'number', example: 12.50, description: 'Prix de vente HT' },
              totalCost: { type: 'number', example: 4.25, description: 'Coût total de production' },
              margin: { type: 'number', example: 65.6, description: 'Marge en pourcentage' },
              description: { type: 'string', example: 'Burger classique avec frites' },
              picture: { type: 'string', nullable: true, example: 'https://cdn.example.com/burger.jpg' },
              diet: {
                type: 'array',
                items: { type: 'string', enum: ['Vegetarian', 'Vegan', 'GlutenFree', 'Halal', 'Kosher'] },
                example: ['Vegan']
              },
              allergens: {
                type: 'array',
                items: { type: 'string' },
                description: 'Liste libre (pas un enum fermé côté modèle)',
                example: ['Gluten', 'Lactose']
              },
              storageType: {
                type: 'array',
                items: { type: 'string', enum: ['Cold', 'Dry', 'Frozen'] },
                example: ['Frozen']
              },
              readyForSale: { type: 'string', nullable: true, enum: ['Yes', 'No'], example: 'Yes' },
              comboItem: { type: 'string', nullable: true, enum: ['Yes', 'No'], example: 'No' },
              numberOfPiecesRecipe: { type: 'number', nullable: true, example: 1 },
              enabled: { type: 'boolean', example: true, description: 'Si le produit est activé pour ce shop' },
              productType: { 
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string', example: 'Food' }
                }
              },
              productCategory: { 
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string', example: 'Burgers' }
                }
              },
              components: {
                type: 'array',
                description: 'Composants pré-fabriqués utilisés dans la recette',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    numberOfUnits: { type: 'number', example: 1, description: 'Quantité utilisée' },
                    unitCost: { type: 'number', example: 0.80, description: 'Coût unitaire' },
                    totalCost: { type: 'number', example: 0.80, description: 'Coût total (numberOfUnits × unitCost)' },
                    storageType: { type: 'string', nullable: true, example: 'FROZEN' },
                    component: {
                      type: 'object',
                      description: 'Détails du composant (MenuComponent)',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string', example: 'Pain burger brioche' },
                        unit: { type: 'string', example: 'piece' },
                        unitCost: { type: 'number', example: 0.80 },
                        storageType: { type: 'string', nullable: true, example: 'DRY' },
                        category: { type: 'string', example: 'Food' },
                        componentCategory: { type: 'string', nullable: true, example: 'Bread' },
                        allergens: { type: 'array', items: { type: 'string' }, example: ['GLUTEN'] },
                        description: { type: 'string', nullable: true },
                        numberOfUnitsRecipe: { type: 'number', nullable: true },
                        ingredients: {
                          type: 'array',
                          description: 'Ingrédients contenus dans le composant (ComponentIngredient)',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string' },
                              quantity: { type: 'number', example: 0.08, description: 'Quantité utilisée' },
                              unit: { type: 'string', nullable: true, example: 'kg' },
                              unitCost: { type: 'number', example: 2.50 },
                              cost: { type: 'number', example: 0.20, description: 'Coût total' },
                              ingredient: {
                                type: 'object',
                                properties: {
                                  id: { type: 'string' },
                                  name: { type: 'string', example: 'Farine T55' },
                                  recipeUnit: { type: 'string', example: 'kg', description: 'Unité de recette' },
                                  purchaseUnit: { type: 'string', example: 'sac 25kg', description: 'Unité d\'achat' },
                                  costPerRecipeUnit: { type: 'number', example: 2.50 },
                                  costPerPurchaseUnit: { type: 'number', example: 62.50 },
                                  storageType: { type: 'string', nullable: true, example: 'DRY' },
                                  ingredientCategory: { type: 'string', nullable: true },
                                  supplier: { type: 'string', nullable: true }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              },
              ingredients: {
                type: 'array',
                description: 'Ingrédients directs (MenuItemIngredient)',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    numberOfUnits: { type: 'number', example: 0.15, description: 'Quantité utilisée' },
                    unitCost: { type: 'number', example: 12.00, description: 'Coût unitaire' },
                    totalCost: { type: 'number', example: 1.80, description: 'Coût total' },
                    storageType: { type: 'string', nullable: true, example: 'FROZEN' },
                    ingredient: {
                      type: 'object',
                      description: 'Matière première (Ingredient)',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string', example: 'Steak haché 15% MG' },
                        recipeUnit: { type: 'string', example: 'kg', description: 'Unité de recette' },
                        purchaseUnit: { type: 'string', example: 'kg', description: 'Unité d\'achat' },
                        costPerRecipeUnit: { type: 'number', example: 12.00 },
                        costPerPurchaseUnit: { type: 'number', example: 12.00 },
                        storageType: { type: 'string', nullable: true, example: 'FROZEN' },
                        ingredientCategory: { type: 'string', nullable: true, example: 'MEAT' },
                        supplier: { type: 'string', nullable: true }
                      }
                    }
                  }
                }
              },
              packagings: {
                type: 'array',
                description: 'Emballages utilisés pour servir le produit (MenuItemPackaging)',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    numberOfUnits: { type: 'number', example: 1, description: 'Quantité utilisée' },
                    unitCost: { type: 'number', example: 0.35, description: 'Coût unitaire' },
                    totalCost: { type: 'number', example: 0.35, description: 'Coût total' },
                    storageType: { type: 'string', nullable: true, example: 'DRY' },
                    packaging: {
                      type: 'object',
                      description: 'Emballage (Packaging)',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string', example: 'Boîte burger carton recyclable' },
                        recipeUnit: { type: 'string', example: 'piece' },
                        purchaseUnit: { type: 'string', example: 'carton 500' },
                        costPerRecipeUnit: { type: 'number', example: 0.35 },
                        costPerPurchaseUnit: { type: 'number', example: 175.00 },
                        storageType: { type: 'string', nullable: true, example: 'DRY' },
                        supplier: { type: 'string', nullable: true }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  })
  @ApiResponse({ status: 404, description: 'Shop non trouvé ou n\'appartient pas au tenant' })
  @ApiResponse({ status: 401, description: 'Non authentifié - Token JWT invalide ou manquant' })
  async getShopMenu(
    @Param('shopId') shopId: string,
    @Query('configId') configId: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.spaceMenusService.getShopMenu(shopId, user.tenantId, configId || undefined, user);
  }

  @Get('shop/:shopId/items')
  @ApiOperation({
    summary: 'Get full tenant menu item catalog with server-computed availability for a shop',
    description:
      "Catalogue complet du tenant, disponibilité calculée côté serveur pour l'espace du shop " +
      '(ingrédients actifs + fournisseur résolu + fournisseur livrant cet espace, récursif sur les ' +
      "composants). Payload léger : une ligne par item (prix TTC scopé espace, raisons d'indisponibilité, " +
      'état enabled sur ce shop) — remplace le chargement catalogue + recettes côté front.',
  })
  @ApiParam({ name: 'shopId', description: 'ID du shop (SpaceElement)' })
  @ApiQuery({ name: 'configId', required: false, description: 'Configuration à lire (défaut : config v1 du parent, sinon première adhésion v2)' })
  @ApiQuery({
    name: 'enabledOnly',
    required: false,
    description:
      'true : ne renvoie que les items ACTIVÉS sur ce shop (le menu du shop, pas le catalogue) — ' +
      'payload et calcul réduits pour les lecteurs qui n’assignent pas (ex. inspecteur builder2)',
  })
  @ApiResponse({
    status: 200,
    description: 'Catalogue avec disponibilité par item',
    schema: {
      type: 'object',
      properties: {
        shopId: { type: 'string' },
        shopName: { type: 'string' },
        spaceId: { type: 'string', nullable: true },
        configId: { type: 'string', nullable: true },
        counts: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            available: { type: 'number' },
            notAvailable: { type: 'number' },
            enabled: { type: 'number' },
          },
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              picture: { type: 'string', nullable: true },
              type: { type: 'string', nullable: true },
              category: { type: 'string', nullable: true },
              price: { type: 'number', description: "TTC, prix de l'espace si défini sinon global" },
              vatRate: { type: 'number', nullable: true },
              available: { type: 'boolean' },
              hasRecipe: { type: 'boolean' },
              missingIngredients: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', enum: ['ingredient', 'packaging'] },
                    name: { type: 'string' },
                    reason: { type: 'string', enum: ['INACTIVE', 'NO_SUPPLIER', 'SUPPLIER_NOT_IN_SPACE'] },
                    supplierId: { type: 'string', nullable: true },
                    supplierName: { type: 'string', nullable: true },
                  },
                },
              },
              enabled: { type: 'boolean', description: 'Item activé sur ce shop' },
              assigned: { type: 'boolean', description: 'Une assignation existe (enabled ou non)' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: "Shop non trouvé ou n'appartient pas au tenant" })
  async getShopAvailableMenuItems(
    @Param('shopId') shopId: string,
    @Query('configId') configId: string | undefined,
    @Query('enabledOnly') enabledOnly: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.spaceMenusService.getShopAvailableMenuItems(
      shopId,
      user.tenantId,
      configId || undefined,
      enabledOnly === 'true' || enabledOnly === '1',
      user,
    );
  }

  @Get('shop/:shopId/inventory')
  @ApiOperation({
    summary: 'Get derived inventory lines for a shop (deduplicated recipe references)',
    description:
      "Inventaire dérivé du menu du shop : ingrédients directs, packagings et composants " +
      '(lignes terminales, sous-recettes non dépliées) des menu items ACTIVÉS sur ce shop dans ' +
      'la config effective — les mêmes items que la section Menu. Une ligne par référence, ' +
      "dédupliquée entre produits, avec la liste des menu items qui l'utilisent (usedIn).",
  })
  @ApiParam({ name: 'shopId', description: 'ID du shop (SpaceElement)' })
  @ApiQuery({ name: 'configId', required: false, description: 'Configuration à lire (défaut : config v1 du parent, sinon première adhésion v2)' })
  @ApiResponse({
    status: 200,
    description: 'Lignes d’inventaire dérivées',
    schema: {
      type: 'object',
      properties: {
        shopId: { type: 'string' },
        shopName: { type: 'string' },
        spaceId: { type: 'string', nullable: true },
        configId: { type: 'string', nullable: true },
        counts: {
          type: 'object',
          properties: {
            total: { type: 'number', description: 'Lignes dédupliquées' },
            menuItems: { type: 'number', description: 'Menu items sources (activés sur le shop)' },
          },
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['ingredient', 'packaging', 'component'] },
              id: { type: 'string' },
              name: { type: 'string' },
              unit: { type: 'string', nullable: true, description: 'recipeUnit (ingrédient/packaging) ou unit (composant)' },
              usedIn: {
                type: 'array',
                description: 'Menu items du shop qui utilisent cette référence',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    picture: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: "Shop non trouvé ou n'appartient pas au tenant" })
  async getShopInventory(
    @Param('shopId') shopId: string,
    @Query('configId') configId: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.spaceMenusService.getShopInventory(shopId, user.tenantId, configId || undefined, user);
  }

  @Get('storage-inventory')
  @ApiOperation({
    summary: 'Get aggregated derived inventory for a set of shops (Storage element, builder2)',
    description:
      "Inventaire d'un élément Storage : union des inventaires dérivés des shops sélectionnés, " +
      'dédupliquée entre shops. Shops F&B : mêmes règles que /space-menu/shop/:shopId/inventory, ' +
      "les références de recette sont les lignes (storageType dry|cold|belowzero|null d'après la " +
      'fiche). Shops MERCH : les menu items activés sont les lignes (kind article, storageType ' +
      "merch, picture). usedIn liste les shops porteurs avec, par shop, les menu items consommateurs " +
      '(vide pour les articles).',
  })
  @ApiQuery({ name: 'shopIds', required: true, description: 'IDs des shops (SpaceElement) séparés par des virgules' })
  @ApiQuery({ name: 'configId', required: false, description: 'Configuration à lire (défaut : config v1 du parent, sinon première adhésion v2)' })
  @ApiResponse({
    status: 200,
    description: 'Lignes d’inventaire agrégées',
    schema: {
      type: 'object',
      properties: {
        configId: { type: 'string', nullable: true },
        shops: {
          type: 'array',
          description: 'Shops effectivement pris en compte (ids inconnus/hors tenant ignorés)',
          items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
        },
        counts: {
          type: 'object',
          properties: {
            shops: { type: 'number' },
            menuItems: { type: 'number', description: 'Menu items sources distincts' },
            total: { type: 'number', description: 'Lignes dédupliquées' },
          },
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['ingredient', 'packaging', 'component', 'article'] },
              id: { type: 'string' },
              name: { type: 'string' },
              unit: { type: 'string', nullable: true },
              picture: { type: 'string', nullable: true, description: 'Articles merch uniquement' },
              storageType: { type: 'string', nullable: true, enum: ['dry', 'cold', 'belowzero', 'merch', null as any] },
              usedIn: {
                type: 'array',
                description: 'Shops qui utilisent cette référence, avec leurs menu items',
                items: {
                  type: 'object',
                  properties: {
                    shopId: { type: 'string' },
                    shopName: { type: 'string' },
                    menuItems: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          picture: { type: 'string', nullable: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  async getStorageInventory(
    @Query('shopIds') shopIds: string | undefined,
    @Query('configId') configId: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.spaceMenusService.getStorageInventory(
      (shopIds || '').split(','),
      user.tenantId,
      configId || undefined,
      user,
    );
  }

  @Get('space/:spaceId/items')
  @ApiOperation({
    summary: 'Get menu items associated to a space with server-computed availability',
    description:
      "Items associés à l'espace (condition 0 STRICTE : MenuItem.spaceIds contient ce spaceId, " +
      'rien d’autre) avec la même disponibilité serveur que /space-menu/shop/:shopId/items. ' +
      'Sert la vue « By Menu Item » — la matrice shop×item vient de GET /space-menu/:spaceId/:configId.',
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiResponse({ status: 200, description: "Items de l'espace avec disponibilité" })
  @ApiResponse({ status: 404, description: "Espace non trouvé ou n'appartient pas au tenant" })
  async getSpaceMenuItems(
    @Param('spaceId') spaceId: string,
    @CurrentUser() user: any,
  ) {
    return this.spaceMenusService.getSpaceMenuItems(spaceId, user.tenantId);
  }

  @Get(':spaceId/:configId/shop-items')
  @ApiOperation({
    summary: 'Get enabled menu items per shop for a whole config (batch, light)',
    description:
      "Version batchée/légère de GET shop/:shopId : un seul appel pour TOUS les shops d'un config " +
      "(id/nom/catégorie/basePrice des articles activés uniquement), au lieu d'un appel par shop " +
      'avec la structure imbriquée complète (composants/ingrédients/pricing). ' +
      "Ne porte PAS la photo de l'article (BUG-199 : elle serait réémise une fois par PdV) — " +
      'la vignette se résout depuis le catalogue GET /menu-items.',
  })
  @ApiParam({ name: 'spaceId', description: "ID de l'espace" })
  @ApiParam({ name: 'configId', description: 'ID de la configuration' })
  @ApiResponse({ status: 200, description: '{ [shopId]: { shopName, items: [{id,name,category,basePrice}] } }' })
  async getConfigShopMenuItemsLight(
    @Param('spaceId') spaceId: string,
    @Param('configId') configId: string,
    @CurrentUser() user: any,
  ) {
    return this.spaceMenusService.getConfigShopMenuItemsLight(spaceId, configId, user.tenantId);
  }

  @Get(':spaceId/:configId')
  @ApiOperation({ summary: 'Get menu configuration for a space/config' })
  @ApiParam({ name: 'spaceId', description: 'ID de l’espace' })
  @ApiParam({ name: 'configId', description: 'ID de la configuration' })
  @ApiResponse({ status: 200, description: 'Configuration de menu de l’espace' })
  async getMenuConfiguration(
    @Param('spaceId') spaceId: string,
    @Param('configId') configId: string,
    @CurrentUser() user: any,
  ) {
    return this.spaceMenusService.getMenuConfiguration(spaceId, configId, user.tenantId);
  }

  @RequirePermissions('menu.fb.spaceMenu')
  @Post()
  @ApiOperation({ summary: 'Save menu configuration for a space/config' })
  @ApiBody({ type: SaveSpaceMenuConfigurationDto })
  @ApiResponse({ status: 201, description: 'Configuration de menu enregistrée' })
  async saveMenuConfiguration(
    @Body() body: SaveSpaceMenuConfigurationDto,
    @CurrentUser() user: any,
  ) {
    return this.spaceMenusService.saveMenuConfiguration(body.spaceId, body.configId, body.menuItems, user.tenantId);
  }
}
