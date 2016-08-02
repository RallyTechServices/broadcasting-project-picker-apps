Ext.define("TSMultiProjectVelocity", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

    config: {
        defaultSettings: {
            showScopeSelector: true,
            showControls: true
        }
    },

    integrationHeaders : {
        name : "TSMultiProjectVelocity"
    },
                        
    launch: function() {
        var me = this;
        this._addComponents();
    },
    
    _addComponents: function() {
        this.removeAll();

        this.headerContainer = this.add({
            xtype:'container',
            itemId:'header-ct', 
            layout: {type: 'hbox'}
        });
        
        this.displayContainer = this.add({
            xtype:'container',
            itemId:'body-ct'
        });
        
        this.headerContainer.add({
            xtype: 'rallynumberfield',
            fieldLabel: 'Number of Sprints',
            labelWidth: 100,
            width: 150,
            margin: '3 10 0 0',
            value : 5,
            minValue: 1,
            allowBlank: false,
            listeners: {
                change: function(picker) {
                    this.sprint_count = picker.getValue()
                    this._updateData();
                },
                scope: this
            }
        });

        if ( this.getSetting('showScopeSelector') || this.getSetting('showScopeSelector') == "true" ) {
            this.headerContainer.add({
                xtype: 'tsmultiprojectpicker',
                listeners: {
                    change: function(picker, projects) {
                        this._changeProjects(picker,projects);
                        this._publishProjects();
                    },
                    scope: this
                }
            });
            this.subscribe(this, 'requestProjects', this._publishProjects, this);
        } else {
            this.subscribe(this, 'projectsChanged', this._changeProjects, this);
            this.publish('requestProjects', this);
        }
        //this._changeProjects();
        
    },
    
    _changeProjects: function(picker,projects) {
        this.logger.log("Chosen projects:", projects);
        this.projects = projects;
        this._updateData();
    },
    
    _updateData: function() {
        this.displayContainer.removeAll();
        var projects = this.projects;
        var sprint_count = this.sprint_count || 1;
        
        if ( Ext.isEmpty(projects) || projects.length === 0 ) { return; }

        this.logger.log("Updating data for sprints/projects", sprint_count, projects);
        
        
    },
    
    _getProjectFilter: function(){
        this.logger.log('_getProjectFilter', this.projects)

        if (!this.projects || this.projects.length === 0){
            return { property:'Project.ObjectID', operator: '>', value: 0 };
        }
        
        var filters =  Ext.Array.map(this.projects, function(project) {
            return { property:'Project.ObjectID', value: project.ObjectID };
        });

        return Rally.data.wsapi.Filter.or(filters);
    },
    
    _publishProjects: function() {
        this.publish('projectsChanged', this.down('tsmultiprojectpicker'), this.projects || []);  
    },
      
    _loadWsapiRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            model: 'Defect',
            fetch: ['ObjectID']
        };
        this.logger.log("Starting load:",config.model);
        Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    getSettingsFields: function() {
        var type_filters = Rally.data.wsapi.Filter.or([
            {property: 'TypePath', value: 'HierarchicalRequirement'},
            {property: 'TypePath', operator: 'contains', value: 'PortfolioItem/'}
        ]);
        
        return [{
            name: 'showScopeSelector',
            xtype: 'rallycheckboxfield',
            fieldLabel: 'Show Scope Selector'
        }];
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    }
    
});
